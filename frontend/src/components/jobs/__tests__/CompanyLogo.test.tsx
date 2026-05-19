import { render, screen } from "@testing-library/react";
import { CompanyLogo } from "../CompanyLogo";

describe("CompanyLogo", () => {
  it("renders Apple glyph SVG for Apple", () => {
    const { container } = render(<CompanyLogo company="Apple" logo="" logoBg="#000" logoFg="#fff" size={36} />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders initial letter for unknown company", () => {
    render(<CompanyLogo company="Acme Corp" logo="A" logoBg="#abc" logoFg="#fff" size={36} />);
    expect(screen.getByText("A")).toBeTruthy();
  });

  it("applies correct background for Stripe", () => {
    const { container } = render(<CompanyLogo company="Stripe" logo="S" logoBg="#635BFF" logoFg="#fff" size={36} />);
    const div = container.firstChild as HTMLElement;
    expect(div.style.background).toBe("#635BFF");
  });
});
