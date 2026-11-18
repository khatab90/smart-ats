// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import assert from "node:assert/strict";
import { afterEach, describe, test, vi } from "vitest";
import { CommandProgress, PriorityList } from "../../src/components/control";
import { LinkBadge } from "../../src/components/status";
import type { SourceId } from "../../src/data/types";

afterEach(cleanup);

describe("PriorityList", () => {
  test("shows installed sources only and saves the full order", () => {
    const onChange = vi.fn<(next: SourceId[]) => void>();
    render(
      <PriorityList
        value={["solar", "grid", "generator"]}
        installed={["grid", "generator"]}
        onChange={onChange}
      />,
    );
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    assert.equal(items.length, 2);
    assert.match(items[0] ?? "", /الشبكة الوطنية/);
    assert.match(items[1] ?? "", /المولد/);
    fireEvent.click(screen.getByLabelText("رفع أولوية المولد"));
    assert.deepEqual(onChange.mock.calls[0][0], ["generator", "grid", "solar"]);
  });

  test("is read-only when disabled", () => {
    const onChange = vi.fn();
    render(<PriorityList value={["grid", "solar", "generator"]} onChange={onChange} disabled />);
    for (const b of screen.getAllByRole("button"))
      assert.equal((b as HTMLButtonElement).disabled, true);
  });
});

describe("LinkBadge", () => {
  test.each([
    ["live", "متصل"],
    ["stale", "بيانات متأخرة"],
    ["offline", "غير متصل"],
    ["never", "لا توجد بيانات"],
  ] as const)("%s → %s", (link, text) => {
    render(<LinkBadge link={link} />);
    assert.ok(screen.getByText(text));
  });
});

describe("CommandProgress", () => {
  test("never reports success before the board confirms", () => {
    const { rerender } = render(
      <CommandProgress
        state={{ id: "1", type: "set_mode", phase: "delivered", message: null }}
        onDismiss={() => {}}
      />,
    );
    assert.ok(screen.getByText(/وصل الأمر إلى البورد/));
    rerender(
      <CommandProgress
        state={{
          id: "1",
          type: "set_mode",
          phase: "rejected",
          message: "النظام ليس في الوضع اليدوي",
        }}
        onDismiss={() => {}}
      />,
    );
    assert.ok(screen.getByText(/رفض البورد الأمر/));
    assert.ok(screen.getByText(/النظام ليس في الوضع اليدوي/));
  });
});
