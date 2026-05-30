import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <span className="site-footer-copy">© 2026 CREATURE WORLD</span>
        <div className="site-footer-links">
          <Link to="/privacy" className="site-footer-link">개인정보처리방침</Link>
          <span className="site-footer-sep">·</span>
          <Link to="/terms" className="site-footer-link">이용약관</Link>
        </div>
      </div>
    </footer>
  );
}
