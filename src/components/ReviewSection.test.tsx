// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { dict } from "@/lib/i18n";
import { ToastProvider } from "./ToastProvider";
import ReviewSection from "./ReviewSection";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

const t = dict.en.reviews;
const fetchMock = vi.fn();

type Props = React.ComponentProps<typeof ReviewSection>;

function renderSection(overrides: Partial<Props> = {}) {
  const props: Props = {
    providerId: "prov_1",
    reviews: [],
    canReview: true,
    signedIn: true,
    myReview: null,
    ...overrides,
  };
  return render(
    <ToastProvider>
      <ReviewSection {...props} />
    </ToastProvider>
  );
}

function openForm() {
  fireEvent.click(screen.getByRole("button", { name: t.write }));
}

function jpeg(name: string) {
  return new File(["x"], name, { type: "image/jpeg" });
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  refresh.mockReset();
});

describe("ReviewSection", () => {
  it("hides the write button and offers sign-in for signed-out visitors", () => {
    renderSection({ canReview: false, signedIn: false });
    expect(screen.queryByRole("button", { name: t.write })).toBeNull();
    expect(screen.getByRole("link", { name: t.signIn })).toBeTruthy();
  });

  it("posts the review as multipart form data and confirms with a toast", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    const { container } = renderSection();
    openForm();
    fireEvent.change(screen.getByLabelText(t.yourReview), {
      target: { value: "Great, punctual work." },
    });
    fireEvent.submit(container.querySelector("form")!);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/providers/prov_1/reviews");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("comment")).toBe("Great, punctual work.");
    expect((init.body as FormData).get("rating")).toBe("5");

    const toast = await screen.findByRole("status");
    expect(toast.textContent).toContain(dict.en.toast.reviewSaved);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("rejects more photos than the remaining slots without a request", () => {
    const { container } = renderSection({
      myReview: {
        rating: 4,
        comment: "ok",
        photos: [
          { id: "a", url: "/a.jpg" },
          { id: "b", url: "/b.jpg" },
        ],
      },
    });
    // myReview present → the trigger reads "Edit".
    fireEvent.click(screen.getByRole("button", { name: t.edit }));

    // Only one slot remains; attaching two must be blocked client-side.
    fireEvent.change(screen.getByLabelText(t.addPhotos), {
      target: { files: [jpeg("1.jpg"), jpeg("2.jpg")] },
    });
    fireEvent.submit(container.querySelector("form")!);

    expect(screen.getByRole("alert").textContent).toContain(
      t.tooManyPhotos(3)
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces the server error via role=alert", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "You already reviewed this provider" }),
    });
    const { container } = renderSection();
    openForm();
    fireEvent.change(screen.getByLabelText(t.yourReview), {
      target: { value: "Nice" },
    });
    fireEvent.submit(container.querySelector("form")!);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("You already reviewed this provider");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("disables the submit button while saving", async () => {
    let resolve!: (v: unknown) => void;
    fetchMock.mockReturnValue(new Promise((r) => (resolve = r)));
    const { container } = renderSection();
    openForm();
    fireEvent.change(screen.getByLabelText(t.yourReview), {
      target: { value: "Nice" },
    });
    fireEvent.submit(container.querySelector("form")!);

    const button = screen.getByRole("button", { name: t.saving });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    resolve({ ok: true, json: async () => ({}) });
    await screen.findByRole("status");
  });
});
