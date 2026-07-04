// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { dict } from "@/lib/i18n";
import { MAX_UPLOAD_SIZE } from "@/lib/upload";
import { ToastProvider } from "../ToastProvider";
import PhotosManager from "./PhotosManager";

const ph = dict.en.dashboard.photos;

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const fetchMock = vi.fn();

// Minimal XMLHttpRequest double: records instances so tests can drive
// progress/completion per upload and assert the 2-at-a-time throttle.
class FakeXhr {
  static instances: FakeXhr[] = [];
  method = "";
  url = "";
  responseType = "";
  status = 0;
  response: unknown = null;
  body: FormData | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  upload = {
    onprogress: null as
      | ((e: { lengthComputable: boolean; loaded: number; total: number }) => void)
      | null,
  };

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  send(body: FormData) {
    this.body = body;
    FakeXhr.instances.push(this);
  }

  finish(status: number, response: unknown) {
    this.status = status;
    this.response = response;
    this.onload?.();
  }
}

function renderManager(
  initial: { id: string; url: string; caption: string }[] = []
) {
  return render(
    <ToastProvider>
      <PhotosManager initial={initial} avatarUrl={null} name="Nuwan" />
    </ToastProvider>
  );
}

function workPhotoInput(container: HTMLElement) {
  const input = container.querySelector<HTMLInputElement>(
    'input[type="file"][multiple]'
  );
  if (!input) throw new Error("multi file input not rendered");
  return input;
}

function jpeg(name: string) {
  return new File(["data"], name, { type: "image/jpeg" });
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  refresh.mockReset();
  FakeXhr.instances = [];
});

describe("PhotosManager uploads", () => {
  it("rejects wrong-type and oversized files locally, without a request", () => {
    const { container } = renderManager();
    fireEvent.change(workPhotoInput(container), {
      target: {
        files: [
          new File(["x"], "anim.gif", { type: "image/gif" }),
          new File([new ArrayBuffer(MAX_UPLOAD_SIZE + 1)], "big.jpg", {
            type: "image/jpeg",
          }),
        ],
      },
    });

    expect(screen.getByText(ph.fileTypeError)).toBeTruthy();
    expect(screen.getByText(ph.fileSizeError)).toBeTruthy();
    expect(FakeXhr.instances).toHaveLength(0);
    // Locally rejected files are not retryable.
    expect(screen.queryByRole("button", { name: ph.retry })).toBeNull();
  });

  it("uploads at most two files at a time, reports progress and prepends successes", async () => {
    const { container } = renderManager();
    fireEvent.change(workPhotoInput(container), {
      target: { files: [jpeg("a.jpg"), jpeg("b.jpg"), jpeg("c.jpg")] },
    });

    // sharp is CPU-bound server-side: only 2 concurrent requests.
    expect(FakeXhr.instances).toHaveLength(2);
    expect(FakeXhr.instances[0].method).toBe("POST");
    expect(FakeXhr.instances[0].url).toBe("/api/provider/photos");

    await act(async () => {
      FakeXhr.instances[0].upload.onprogress?.({
        lengthComputable: true,
        loaded: 1,
        total: 2,
      });
    });
    expect(screen.getByText("50%")).toBeTruthy();

    await act(async () => {
      FakeXhr.instances[0].finish(200, {
        photo: { id: "p1", url: "/uploads/a.webp", caption: null },
      });
    });

    // First slot freed → the third file starts; grid gains the new photo.
    expect(FakeXhr.instances).toHaveLength(3);
    expect(screen.getByText(ph.uploaded)).toBeTruthy();
    expect(screen.getByAltText("Work photo")).toBeTruthy();
    // Batch still in flight → no refresh yet.
    expect(refresh).not.toHaveBeenCalled();

    await act(async () => {
      FakeXhr.instances[1].finish(200, {
        photo: { id: "p2", url: "/uploads/b.webp", caption: null },
      });
      FakeXhr.instances[2].finish(200, {
        photo: { id: "p3", url: "/uploads/c.webp", caption: null },
      });
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("shows the service error on a failed upload and retries it", async () => {
    const { container } = renderManager();
    fireEvent.change(workPhotoInput(container), {
      target: { files: [jpeg("a.jpg")] },
    });

    await act(async () => {
      FakeXhr.instances[0].finish(400, { error: "Image must be under 5MB" });
    });
    expect(screen.getByText(ph.failed)).toBeTruthy();
    expect(screen.getByText("Image must be under 5MB")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: ph.retry }));
    expect(FakeXhr.instances).toHaveLength(2);

    await act(async () => {
      FakeXhr.instances[1].finish(200, {
        photo: { id: "p1", url: "/uploads/a.webp", caption: null },
      });
    });
    expect(screen.getByText(ph.uploaded)).toBeTruthy();
  });

  it("attaches the caption to the first photo of the batch only", () => {
    const { container } = renderManager();
    fireEvent.change(screen.getByPlaceholderText(ph.captionPh), {
      target: { value: "Kitchen rewiring" },
    });
    fireEvent.change(workPhotoInput(container), {
      target: { files: [jpeg("a.jpg"), jpeg("b.jpg")] },
    });

    expect(FakeXhr.instances[0].body?.get("caption")).toBe("Kitchen rewiring");
    expect(FakeXhr.instances[1].body?.get("caption")).toBeNull();
  });
});

describe("PhotosManager reorder", () => {
  const photos = [
    { id: "p1", url: "/uploads/1.webp", caption: "one" },
    { id: "p2", url: "/uploads/2.webp", caption: "two" },
  ];

  it("moves a photo optimistically and PATCHes the full order", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    renderManager(photos);

    fireEvent.click(screen.getAllByRole("button", { name: ph.moveRight })[0]);

    expect(fetchMock).toHaveBeenCalledWith("/api/provider/photos/order", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: ["p2", "p1"] }),
    });
    // Optimistic: p2 is the cover (first grid cell) before the PATCH lands.
    const cells = screen.getAllByAltText(/one|two/);
    expect(cells[0].getAttribute("alt")).toBe("two");

    await act(async () => {});
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("reverts the order and toasts when the PATCH fails", async () => {
    fetchMock.mockResolvedValue({ ok: false });
    renderManager(photos);

    fireEvent.click(screen.getAllByRole("button", { name: ph.moveRight })[0]);
    const toast = await screen.findByRole("status");
    expect(toast.textContent).toContain(ph.reorderError);

    const cells = screen.getAllByAltText(/one|two/);
    expect(cells[0].getAttribute("alt")).toBe("one");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("disables move-left on the cover and move-right on the last photo", () => {
    renderManager(photos);
    const left = screen.getAllByRole("button", { name: ph.moveLeft });
    const right = screen.getAllByRole("button", { name: ph.moveRight });
    expect((left[0] as HTMLButtonElement).disabled).toBe(true);
    expect((right[1] as HTMLButtonElement).disabled).toBe(true);
    expect((left[1] as HTMLButtonElement).disabled).toBe(false);
    expect((right[0] as HTMLButtonElement).disabled).toBe(false);
  });
});
