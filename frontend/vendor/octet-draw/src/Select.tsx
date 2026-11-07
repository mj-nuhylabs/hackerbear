// Octet's one select: a button drawn like the fields, whose choices open as Octet's list (Pick in Menu.tsx), so a
// setting's choices look and work as every other list does.
import { CaretUpDown } from "@phosphor-icons/react";
import { Pick } from "./Menu";

export function Select({ value, label, options, onChange }: { value: string; label: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <Pick label={label} value={value} groups={[options.map(([key, name]) => ({ key, name, icon: null }))]} onPick={onChange} className="select-field">
      <span>{options.find(([v]) => v === value)?.[1] ?? value}</span>
      <CaretUpDown size={12} aria-hidden />
    </Pick>
  );
}
