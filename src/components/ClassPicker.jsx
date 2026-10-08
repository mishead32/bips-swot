/** Tick-box picker for assigning many classes to a teacher */
export default function ClassPicker({ classes, value, onChange }) {
  const wings = [...new Set(classes.map((c) => c.wing || 'Other'))];
  const toggle = (id) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  const toggleWing = (w) => {
    const ids = classes.filter((c) => (c.wing || 'Other') === w).map((c) => c.id);
    const all = ids.every((id) => value.includes(id));
    onChange(all ? value.filter((x) => !ids.includes(x)) : [...new Set([...value, ...ids])]);
  };
  return (
    <div className="class-picker">
      {wings.map((w) => (
        <div key={w} className="cp-wing">
          <button type="button" className="cp-wing-name" onClick={() => toggleWing(w)}>{w} <span className="muted">(all)</span></button>
          <div className="cp-list">
            {classes.filter((c) => (c.wing || 'Other') === w).map((c) => (
              <label key={c.id} className={`cp-item ${value.includes(c.id) ? 'on' : ''}`}>
                <input type="checkbox" checked={value.includes(c.id)} onChange={() => toggle(c.id)} />
                {c.id}
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
