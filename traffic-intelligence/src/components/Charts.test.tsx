import { render } from "@testing-library/react";
import { Sparkline } from "./Charts";

describe("Sparkline", () => {
  it("breaks at non-finite values without emitting invalid SVG coordinates", () => {
    const { container } = render(
      <Sparkline
        values={[1, Number.NaN, 3, Number.POSITIVE_INFINITY, 5, 7]}
        source="cloudflare"
      />,
    );
    const path = container.querySelector("path");
    expect(path?.getAttribute("d")).toBe(
      "M0.0,26.0 M48.0,18.0 M96.0,10.0 L120.0,2.0",
    );
    expect(path?.getAttribute("d")).not.toMatch(/NaN|Infinity/);
  });

  it("returns no chart when fewer than two finite values exist", () => {
    const { container } = render(
      <Sparkline
        values={[Number.NaN, 4, Number.NEGATIVE_INFINITY]}
        source="cloudflare"
      />,
    );
    expect(container.querySelector("svg")).toBeNull();
  });
});
