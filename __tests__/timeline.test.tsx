import { expect, test, describe } from "bun:test";
import { render } from "@testing-library/react";
import React from "react";
import Component from "../packages/Component";
import Vertical from "../packages/Vertical";

describe("Timeline Component", () => {
  const mockItems = [
    { time: [0, 10], content: "Item 1" },
    { time: 15, content: "Item 2" },
    { time: [20, 30], content: "Item 3", level: 2 },
  ];

  test("renders horizontal timeline correctly", () => {
    const { getByText } = render(
      <Component
        items={mockItems}
        currentTime={5}
        totalTime={100}
        scale={1}
      />
    );
    expect(getByText("Item 1")).toBeTruthy();
    expect(getByText("Item 2")).toBeTruthy();
    expect(getByText("Item 3")).toBeTruthy();
  });

  test("handles overlapping items and manual level in horizontal mode", () => {
    const overlappingItems = [
      { time: [0, 10], content: "Overlap 1" },
      { time: [5, 15], content: "Overlap 2" }, // Should auto-calculate level 1
      { time: [0, 20], content: "Manual Level", level: 5 },
    ];
    const { getByText } = render(
      <Component
        items={overlappingItems}
        currentTime={0}
        totalTime={100}
      />
    );
    
    const item1 = getByText("Overlap 1");
    const item2 = getByText("Overlap 2");
    const item3 = getByText("Manual Level");

    expect(item1.style.top).toBe("0px");
    expect(item2.style.top).toBe("40px");
    expect(item3.style.top).toBe("200px"); // level 5 * 40px
  });

  test("renders vertical timeline correctly", () => {
    const { getByText } = render(
      <Vertical
        items={mockItems}
        currentTime={5}
        totalTime={100}
        height={500}
      />
    );
    expect(getByText("Item 1")).toBeTruthy();
    expect(getByText("Item 2")).toBeTruthy();
  });

  test("vertical timeline implements auto-disappear and auto-fill", () => {
    const { queryByText, getByText } = render(
      <Vertical
        items={mockItems}
        currentTime={20} // Past Item 1 (0-10) and Item 2 (15)
        totalTime={100}
        prev={0} // No items preserved
      />
    );
    
    // Item 1 and Item 2 should be gone
    expect(queryByText("Item 1")).toBeNull();
    expect(queryByText("Item 2")).toBeNull();
    
    // Item 3 should be there and moved to the first row (top: 0px)
    const item3 = getByText("Item 3");
    expect(item3.style.top).toBe("0px");
  });

  test("vertical timeline ignores level property", () => {
    const itemsWithLevel = [
      { time: [0, 10], content: "Level Item", level: 10 }
    ];
    const { getByText } = render(
      <Vertical
        items={itemsWithLevel}
        currentTime={0}
        totalTime={100}
      />
    );
    const item = getByText("Level Item");
    expect(item.style.top).toBe("0px"); // Should ignore level 10 and use index 0
  });
});
