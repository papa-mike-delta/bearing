const contentFields = [
  "wins",
  "challenges",
  "learnings",
  "gratitude",
  "notes",
  "priorities",
  "itemIds",
] as const;

/** Period and date for a reflection. Callers pass the latest slot, never a stale render. */
export class ReviewSlot {
  static next(
    current: { period: string; localDate: string },
    patch: { period?: string; localDate?: string },
  ) {
    return {
      period: patch.period ?? current.period,
      localDate: patch.localDate ?? current.localDate,
    };
  }

  static match<T extends { id: string; period: string; localDate: string }>(
    reviews: readonly T[],
    period: string,
    localDate: string,
  ) {
    return reviews.find(
      (review) => review.period === period && review.localDate === localDate,
    );
  }

  /** A saved reflection may fill the form until the user edits its text. */
  static canOpen(dirtyFields: readonly string[], pending?: number) {
    if (pending) return false;
    return !dirtyFields.some((field) =>
      (contentFields as readonly string[]).includes(field),
    );
  }

  /**
   * The slot always becomes the controls the user just set.
   * A saved reflection opens only when the draft has no text edits.
   */
  static decide<T extends { id: string; period: string; localDate: string }>(
    current: { period: string; localDate: string },
    patch: { period?: string; localDate?: string },
    reviews: readonly T[],
    dirty: boolean,
  ) {
    const slot = ReviewSlot.next(current, patch);
    const match = ReviewSlot.match(reviews, slot.period, slot.localDate);
    const action = !match ? "edit" : dirty ? "hold" : "open";
    return { slot, match, action } as const;
  }

  static same(
    visible: { period: string; localDate: string },
    other: { period: string; localDate: string },
  ) {
    return (
      visible.period === other.period && visible.localDate === other.localDate
    );
  }
}
