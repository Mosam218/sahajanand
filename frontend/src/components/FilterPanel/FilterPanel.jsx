import './FilterPanel.css';

// groups: [{ key, label, options: [{ value, count }] }]
// selected: { [key]: string[] }
export default function FilterPanel({ groups, selected, onToggle, onClear }) {
  const active = Object.values(selected).reduce((n, v) => n + v.length, 0);
  if (groups.length === 0) return null;
  return (
    <form className="filters" aria-label="Filter products" onSubmit={(e) => e.preventDefault()}>
      <div className="filters__head">
        <h2 className="filters__title">Filters</h2>
        {active > 0 && <button type="button" className="filters__clear" onClick={onClear}>Clear all ({active})</button>}
      </div>
      {groups.map((g) => (
        <fieldset key={g.key} className="filters__group">
          <legend>{g.label}</legend>
          {g.options.map((o) => (
            <label key={o.value} className="filters__opt">
              <input
                type="checkbox"
                checked={(selected[g.key] || []).includes(o.value)}
                onChange={() => onToggle(g.key, o.value)}
              />
              <span>{o.value}</span>
              <span className="filters__n num">{o.count}</span>
            </label>
          ))}
        </fieldset>
      ))}
    </form>
  );
}
