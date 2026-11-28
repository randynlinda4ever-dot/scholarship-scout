type WorkspaceSubnavOption = { value: string; label: string };

export function WorkspaceSubnav({
  label,
  active,
  options,
  onChange,
}: {
  label: string;
  active: string;
  options: WorkspaceSubnavOption[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="workspace-subnav" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          type="button"
          key={option.value}
          className={active === option.value ? "is-active" : ""}
          aria-pressed={active === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
