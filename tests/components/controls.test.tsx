// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import assert from "node:assert/strict";
import { afterEach, describe, test, vi } from "vitest";
import { CommandProgress } from "../../src/components/control";
import { PriorityPicker } from "../../src/features/settings/PriorityPicker";
import { LinkBadge } from "../../src/components/status";
import type { SourceId } from "../../src/data/types";

afterEach(cleanup);

describe("PriorityPicker", () => {
  test("shows the order as a chain of installed sources only", () => {
    render(
      <PriorityPicker
        value={["solar", "grid", "generator"]}
        installed={["grid", "generator"]}
        onChange={() => {}}
      />,
    );
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    assert.equal(items.length, 2);
    assert.match(items[0] ?? "", /الشبكة الوطنية/);
    assert.match(items[1] ?? "", /المولد/);
  });

  test("tapping sources in order sets the priority; the last one places itself", () => {
    const onChange = vi.fn<(next: SourceId[]) => void>();
    render(
      <PriorityPicker
        value={["grid", "solar", "generator"]}
        installed={["grid", "solar", "generator"]}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText("تغيير الترتيب"));
    fireEvent.click(screen.getByText("المولد"));
    fireEvent.click(screen.getByText("الطاقة الشمسية"));
    assert.deepEqual(onChange.mock.calls[0][0], ["generator", "solar", "grid"]);
  });

  test("uninstalled sources keep their place at the end; read-only has no change button", () => {
    const onChange = vi.fn<(next: SourceId[]) => void>();
    const { unmount } = render(
      <PriorityPicker
        value={["grid", "solar", "generator"]}
        installed={["grid", "generator"]}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText("تغيير الترتيب"));
    fireEvent.click(screen.getByText("المولد"));
    assert.deepEqual(onChange.mock.calls[0][0], ["generator", "grid", "solar"]);
    unmount();
    render(
      <PriorityPicker
        value={["grid", "solar", "generator"]}
        installed={["grid", "solar"]}
        onChange={onChange}
        disabled
      />,
    );
    assert.equal(screen.queryByText("تغيير الترتيب"), null);
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
