// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
    providerName: "Nimal",
    reviews: [],
    canReview: true,
    canRespond: false,
    signedIn: true,
    myReview: null,
    summary: null,
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

  // Verified-email gate (#115): a signed-in but unconfirmed reviewer sees the
  // verify prompt instead of the write button.
  it("shows the verify-email prompt and hides the write button when emailUnverified", () => {
    renderSection({ emailUnverified: true });
    expect(screen.getByText(dict.en.verify.reviewPrompt)).toBeTruthy();
    expect(screen.queryByRole("button", { name: t.write })).toBeNull();
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
      json: async () => ({ errorCode: "conflict" }),
    });
    const { container } = renderSection();
    openForm();
    fireEvent.change(screen.getByLabelText(t.yourReview), {
      target: { value: "Nice" },
    });
    fireEvent.submit(container.querySelector("form")!);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(dict.en.errorCodes.conflict);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("submits the optional per-dimension ratings the user set", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    const { container } = renderSection();
    openForm();
    fireEvent.change(screen.getByLabelText(t.yourReview), {
      target: { value: "Great, punctual work." },
    });
    // Set Quality = 4 stars (the 4th star button within the Quality group).
    const qualityGroup = screen.getByRole("group", { name: t.dimensions.quality });
    fireEvent.click(
      within(qualityGroup).getByRole("button", {
        name: t.dimensionStarLabel(t.dimensions.quality, 4),
      })
    );
    fireEvent.submit(container.querySelector("form")!);

    const body = fetchMock.mock.calls[0][1].body as FormData;
    expect(body.get("quality")).toBe("4");
    // Untouched dimensions are omitted entirely (server leaves them unchanged).
    expect(body.get("punctuality")).toBeNull();
    expect(body.get("value")).toBeNull();
  });

  it("renders the dimension breakdown and the 5→1 star distribution", () => {
    renderSection({
      summary: {
        rating: 4.5,
        count: 4,
        dimensions: {
          quality: 4.5,
          punctuality: null,
          value: 4,
          communication: 5,
        },
        distribution: { "5": 3, "4": 0, "3": 1, "2": 0, "1": 0 },
      },
    });
    expect(screen.getByText(t.breakdown)).toBeTruthy();
    expect(screen.getByText(t.distribution)).toBeTruthy();
    // A scored dimension shows its average; an unscored one reads "not rated".
    expect(screen.getByText("4.5")).toBeTruthy();
    expect(screen.getByText(t.notRated)).toBeTruthy();
    // Distribution rows are labelled per star with their review counts.
    expect(screen.getByLabelText(t.distributionRow(5, 3))).toBeTruthy();
    expect(screen.getByLabelText(t.distributionRow(3, 1))).toBeTruthy();
  });

  it("hides the breakdown when there are no reviews yet", () => {
    renderSection({ summary: null });
    expect(screen.queryByText(t.breakdown)).toBeNull();
    expect(screen.queryByText(t.distribution)).toBeNull();
  });

  // Provider responses (#395): the reply renders for everyone; only the
  // profiled provider (canRespond) gets the respond/edit/delete controls.
  const REVIEW = {
    id: "rev_1",
    rating: 5,
    comment: "Great work.",
    createdAt: "2026-01-01T00:00:00.000Z",
    userName: "Kasun",
    photos: [],
    response: null,
  };

  it("renders the provider's response under the review for all visitors", () => {
    renderSection({
      canReview: false,
      signedIn: false,
      reviews: [
        {
          ...REVIEW,
          response: { text: "Thank you!", createdAt: "2026-01-02T00:00:00.000Z" },
        },
      ],
    });
    expect(screen.getByText(t.responseFrom("Nimal"))).toBeTruthy();
    expect(screen.getByText("Thank you!")).toBeTruthy();
    // No owner controls for a visitor.
    expect(screen.queryByRole("button", { name: t.respond })).toBeNull();
    expect(screen.queryByRole("button", { name: t.deleteResponse })).toBeNull();
  });

  it("lets the profile owner post a response as JSON", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    renderSection({ canReview: false, canRespond: true, reviews: [REVIEW] });

    fireEvent.click(screen.getByRole("button", { name: t.respond }));
    fireEvent.change(screen.getByLabelText(t.yourResponse), {
      target: { value: "Thanks for the feedback!" },
    });
    fireEvent.click(screen.getByRole("button", { name: t.postResponse }));

    await screen.findByRole("status");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/reviews/rev_1/response");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      text: "Thanks for the feedback!",
    });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("pre-fills the form when editing and offers delete for an existing response", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    renderSection({
      canReview: false,
      canRespond: true,
      reviews: [
        {
          ...REVIEW,
          response: { text: "Old reply", createdAt: "2026-01-02T00:00:00.000Z" },
        },
      ],
    });

    fireEvent.click(screen.getByRole("button", { name: t.editResponse }));
    const textarea = screen.getByLabelText(t.yourResponse) as HTMLTextAreaElement;
    expect(textarea.value).toBe("Old reply");
  });

  it("deletes the response and refreshes", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    renderSection({
      canReview: false,
      canRespond: true,
      reviews: [
        {
          ...REVIEW,
          response: { text: "Old reply", createdAt: "2026-01-02T00:00:00.000Z" },
        },
      ],
    });

    fireEvent.click(screen.getByRole("button", { name: t.deleteResponse }));
    await screen.findByRole("status");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/reviews/rev_1/response");
    expect(init.method).toBe("DELETE");
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("surfaces a response error via role=alert", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ errorCode: "forbidden" }),
    });
    renderSection({ canReview: false, canRespond: true, reviews: [REVIEW] });

    fireEvent.click(screen.getByRole("button", { name: t.respond }));
    fireEvent.change(screen.getByLabelText(t.yourResponse), {
      target: { value: "Thanks!" },
    });
    fireEvent.click(screen.getByRole("button", { name: t.postResponse }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(dict.en.errorCodes.forbidden);
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
