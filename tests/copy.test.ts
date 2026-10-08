// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NOTE_TIME, copyText, startCopy } from "../src/scripts/copy";

let execCommand = vi.fn(() => true);

beforeEach(() => {
  execCommand = vi.fn(() => true);
  Object.defineProperty(document, "execCommand", {
    configurable: true,
    value: execCommand,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Replaces navigator.clipboard.writeText with `write`. */
function clipboard(write: (text: string) => Promise<void>) {
  vi.stubGlobal("navigator", { clipboard: { writeText: write } });
}

describe("copyText", () => {
  it("copies through the Clipboard API when it is allowed", async () => {
    const write = vi.fn(() => Promise.resolve());
    clipboard(write);
    expect(await copyText("contact@adioz.dev")).toBe(true);
    expect(write).toHaveBeenCalledWith("contact@adioz.dev");
    expect(execCommand).not.toHaveBeenCalled();
  });

  it("falls back to a selected offscreen textarea and the copy command when the API is denied", async () => {
    clipboard(() => Promise.reject(new Error("denied")));
    let selected = "";
    execCommand.mockImplementation(() => {
      const field = document.querySelector("textarea")!;
      selected = field.value;
      expect(field.hasAttribute("readonly")).toBe(true);
      return true;
    });
    expect(await copyText("contact@adioz.dev")).toBe(true);
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(selected).toBe("contact@adioz.dev");
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("falls back when the Clipboard API is missing", async () => {
    vi.stubGlobal("navigator", {});
    expect(await copyText("x")).toBe(true);
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("reports failure when the fallback copy fails too", async () => {
    clipboard(() => Promise.reject(new Error("denied")));
    execCommand.mockImplementation(() => false);
    expect(await copyText("x")).toBe(false);
    execCommand.mockImplementation(() => {
      throw new Error("unsupported");
    });
    expect(await copyText("x")).toBe(false);
    expect(document.querySelector("textarea")).toBeNull();
  });
});

describe("startCopy", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <button class="copy-mail" hidden data-copy="contact@adioz.dev"
        data-copied="Copied" data-failed="Copy failed"></button>
      <span class="copy-note" role="status"></span>`;
  });

  const button = () => document.querySelector<HTMLButtonElement>("button")!;
  const note = () => document.querySelector<HTMLElement>(".copy-note")!;
  const press = async () => {
    button().click();
    await vi.waitFor(() => expect(note().textContent).not.toBe(""));
  };

  it("shows the knob", () => {
    startCopy(button(), note());
    expect(button().hidden).toBe(false);
  });

  it("notes a copy and returns focus to the knob, clearing the note after NOTE_TIME", async () => {
    clipboard(() => Promise.resolve());
    startCopy(button(), note());
    await press();
    expect(note().textContent).toBe("Copied");
    expect(document.activeElement).toBe(button());
    vi.useFakeTimers();
    button().click();
    await vi.advanceTimersByTimeAsync(NOTE_TIME);
    expect(note().textContent).toBe("");
  });

  it("notes a failed copy", async () => {
    clipboard(() => Promise.reject(new Error("denied")));
    execCommand.mockImplementation(() => false);
    startCopy(button(), note());
    await press();
    expect(note().textContent).toBe("Copy failed");
  });
});
