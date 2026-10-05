/*
 * Renders Astro components with the Astro Container API and parses the HTML
 * with happy-dom, so tests query elements and attributes instead of matching
 * strings. The container leaves Astro.site unset, so Layout.astro, which
 * builds absolute URLs from it, renders only in a real build.
 */
import {
  experimental_AstroContainer as AstroContainer,
  type ContainerRenderOptions,
} from "astro/container";
import { Window } from "happy-dom";

const container = await AstroContainer.create();

type Component = Parameters<typeof container.renderToString>[0];

/** Renders a component and parses its HTML into a document. */
export async function render(
  component: Component,
  options?: ContainerRenderOptions,
): Promise<Document> {
  const html = await container.renderToString(component, options);
  const window = new Window();
  return new window.DOMParser().parseFromString(
    html,
    "text/html",
  ) as unknown as Document;
}

/** Trimmed text content with runs of whitespace collapsed to one space. */
export function text(element: Element | null): string {
  return (element?.textContent ?? "").replace(/\s+/g, " ").trim();
}
