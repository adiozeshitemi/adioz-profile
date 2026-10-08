/*
 * The contact section's copy knob, which copies the email address.
 */

/** Milliseconds a copy's status note stays before it clears. */
export const NOTE_TIME = 2400;

/**
 * Copies `text`, through the Clipboard API, or, where that is missing or
 * denied, by selecting it in an offscreen read-only <textarea> and running
 * the copy command. Resolves to whether the text was copied.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.cssText = "position: fixed; top: 0; left: 0; opacity: 0";
    document.body.append(field);
    field.select();
    let copied = false;
    try {
      // The copy command, typed apart from its deprecated DOM signature.
      const legacy = document as unknown as {
        execCommand(command: "copy"): boolean;
      };
      copied = legacy.execCommand("copy");
    } catch {
      copied = false;
    }
    field.remove();
    return copied;
  }
}

/**
 * Wires `button`, rendered hidden, to copy its data-copy text: shows it, and
 * on each press writes data-copied or data-failed into `note` (a status
 * region), returns focus to the button and clears the note after NOTE_TIME.
 * Returns a function that stops it.
 */
export function startCopy(
  button: HTMLButtonElement,
  note: HTMLElement,
): () => void {
  let clear = 0;
  const onClick = async () => {
    const copied = await copyText(button.dataset.copy ?? "");
    note.textContent =
      (copied ? button.dataset.copied : button.dataset.failed) ?? "";
    button.focus();
    clearTimeout(clear);
    clear = window.setTimeout(() => (note.textContent = ""), NOTE_TIME);
  };
  button.hidden = false;
  button.addEventListener("click", onClick);
  return () => {
    clearTimeout(clear);
    button.removeEventListener("click", onClick);
  };
}
