export default function PhoneChrome() {
  return (
    <div className="phone-chrome" aria-hidden="true">
      <span className="phone-time">9:41</span>
      <span className="phone-island" />
      <span className="phone-status">
        <span className="signal-bars">
          <span />
          <span />
          <span />
          <span />
        </span>
        <span className="wifi-mark" />
        <span className="battery-mark">
          <span />
        </span>
      </span>
    </div>
  );
}
