export type HabitControl = "up" | "down" | "edit";

// Keep the pressed direction unless the moved row has reached that end.
export function habitMoveFocus(index: number, length: number, direction: "up" | "down"): HabitControl {
  if (length <= 1) return "edit";
  if (direction === "up" && index === 0) return "down";
  if (direction === "down" && index === length - 1) return "up";
  return direction;
}
