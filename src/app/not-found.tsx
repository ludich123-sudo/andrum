import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="login-wrap">
      <div className="card center" style={{ maxWidth: 420 }}>
        <h2>Sidan finns inte</h2>
        <p className="muted">Länken kan vara gammal eller felstavad.</p>
        <Link className="btn" href="/">Till startsidan</Link>
      </div>
    </div>
  );
}
