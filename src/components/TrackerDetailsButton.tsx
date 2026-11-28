import type { Scholarship } from '../domain/types.js';

type TrackerDetailsButtonProps = {
  item: Scholarship;
  onOpen: (item: Scholarship) => void;
};

export function TrackerDetailsButton({ item, onOpen }: TrackerDetailsButtonProps) {
  return (
    <button
      type="button"
      className="secondary tracker-details"
      aria-label={`Open details for ${item.name}`}
      onClick={() => onOpen(item)}
    >
      ›
    </button>
  );
}
