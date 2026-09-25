import { describe, expect, it } from "vitest";
import { escapeHtml } from "@/lib/html";
import { renderEmail } from "@/lib/email";

describe("escapeHtml", () => {
  it("escapes characters that could inject markup", () => {
    expect(escapeHtml(`<a href="x">Tom & 'Jerry'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;"
    );
  });
});

describe("renderEmail", () => {
  it("escapes user-entered text everywhere it appears", () => {
    const html = renderEmail(`<b>Eve</b>`, {
      heading: `<script>alert(1)</script>`,
      paragraphs: [`Click <a href="https://evil.example">here</a>`],
      details: [{ label: "Notes", value: `<img src=x onerror=alert(1)>` }],
      link: "/rides/123",
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>Eve</b>");
    expect(html).not.toContain(`<a href="https://evil.example">`);
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });

  it("links the button into the app", () => {
    const html = renderEmail("Ann", { heading: "Hi", link: "/rides/abc", ctaLabel: "Open" });
    expect(html).toMatch(/href="https?:\/\/[^"]+\/rides\/abc"/);
  });
});
