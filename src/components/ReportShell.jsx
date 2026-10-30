import BrandLogo from './BrandLogo.jsx'
import LanguageDropdown from './LanguageDropdown.jsx'

/** Header + colour theme (amber | blue | green) around a ReportForm. */
export default function ReportShell({ theme, children }) {
  return (
    <div className={`home rtheme rtheme--${theme}`}>
      <header className="home__topbar">
        <BrandLogo />
        <LanguageDropdown />
      </header>
      {children}
    </div>
  )
}