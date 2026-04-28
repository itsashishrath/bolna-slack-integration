export default function StatusBadge({ text, variant }) {
  return <span className={`badge badge-${variant}`}>{text}</span>;
}
