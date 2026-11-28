type FieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  id?: string;
  required?: boolean;
  requirement?: "required" | "optional";
  min?: number;
  max?: number;
  step?: number | "any";
  error?: string;
};

export function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  id,
  required = false,
  requirement,
  min,
  max,
  step,
  error,
}: FieldProps) {
  const errorId = id ? id + "-error" : undefined;

  return (
    <label className={"field" + (error ? " field-invalid" : "")}>
      <span className="field-label-row">
        <span>{label}</span>
        {requirement ? (
          <small className="field-requirement" data-requirement={requirement}>
            {requirement === "required" ? "Required" : "Optional"}
          </small>
        ) : null}
      </span>
      <input
        id={id}
        type={type}
        min={min}
        max={max}
        step={step}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        aria-required={required || undefined}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={error ? errorId : undefined}
      />
      {error && errorId ? <small id={errorId} className="field-error" role="alert">{error}</small> : null}
    </label>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[][];
  required?: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select required={required} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([optionValue, optionLabel]) => (
          <option value={optionValue} key={optionValue}>{optionLabel}</option>
        ))}
      </select>
    </label>
  );
}

export function CheckField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="check-field">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
