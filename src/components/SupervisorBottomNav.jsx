/**
 * SupervisorBottomNav.jsx — the supervisor interface's bottom tab bar
 * (Home · Reports · Alerts · Settings), shared by every supervisor screen.
 *
 * Extracted from the dashboard so all five supervisor pages carry the same
 * navigation: the dashboard shows it with Home active, the Reports and
 * Alerts screens with their own tab active, and the Home-section pages
 * (Assign Machine, Labour Updates, Attendance) with Home active.
 *
 * Behaviour (identical to the dashboard's original inline nav):
 *   - the active tab is highlighted (primary blue) and inert;
 *   - Home / Reports / Alerts navigate through the props the screen passes
 *     in (each screen decides where a tab leads — e.g. a sub-page's Home
 *     tab returns to the dashboard);
 *   - Settings is a demo placeholder: tapping it shows the same
 *     "not available in this demo" toast the dashboard used to show;
 *   - the Alerts tab carries the red unresolved-alerts badge, counted from
 *     the shared store (data/alerts.js) unless the screen passes its own
 *     live count (the Alerts screen does, so the badge follows each
 *     acknowledge/resolve immediately).
 *
 * Styling comes from the existing .sup__nav* rules (screens.css) — icons,
 * colors, spacing and the red .sup__nav-badge are unchanged.
 *
 * Props:
 *  - active        which tab is highlighted: 'home' | 'reports' | 'alerts'
 *                  | 'settings' (default 'home')
 *  - onHome()      Home tab tap (ignored while Home is active)
 *  - onReports()   Reports tab tap (ignored while Reports is active)
 *  - onAlerts()    Alerts tab tap (ignored while Alerts is active)
 *  - alertsBadge   optional override for the Alerts badge count (defaults
 *                  to unresolved defect reports from the shared collection)
 */

import { useState } from 'react';
import Toast from './Toast.jsx';
import { useI18n } from '../i18n.jsx';
import { getDefectReports } from '../data/db.js';
import {
  AlertTriangleIcon,
  ClipboardIcon,
  CogIcon,
  HomeIcon,
} from './icons.jsx';

export default function SupervisorBottomNav({
  active = 'home',
  onHome,
  onReports,
  onAlerts,
  alertsBadge,
}) {
  const { t } = useI18n();

  // The Settings tab's "not available in this demo" toast (the same
  // placeholder behaviour the dashboard's inline nav had).
  const [toast, setToast] = useState(null);

  // Unresolved defect reports (new + acknowledged) — the Alerts tab's red
  // badge. Counted from the SHARED defectReports collection (data/db.js),
  // the same live data the Alerts screen renders, so the badge follows
  // acknowledge/resolve immediately and grows when a labour files a new
  // report. Screens that hold the feed in state (the Alerts screen) pass
  // their live count so the badge never lags a render behind.
  const badge =
    alertsBadge ??
    getDefectReports().filter((report) => report?.status !== 'resolved')
      .length;

  const tabs = [
    { id: 'home', label: t('supNavHome'), icon: <HomeIcon size={22} />, onClick: onHome },
    { id: 'reports', label: t('supNavReports'), icon: <ClipboardIcon size={22} />, onClick: onReports },
    { id: 'alerts', label: t('supNavAlerts'), icon: <AlertTriangleIcon size={22} />, onClick: onAlerts, badge },
    { id: 'settings', label: t('supNavSettings'), icon: <CogIcon size={22} /> },
  ];

  return (
    <>
      <nav className="sup__nav" aria-label={t('supTitle')}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={
              'sup__nav-item' +
              (active === tab.id ? ' sup__nav-item--active' : '')
            }
            aria-current={active === tab.id ? 'page' : undefined}
            onClick={() => {
              if (active === tab.id) return;
              if (tab.onClick) tab.onClick();
              else setToast(t('supDemoOnly'));
            }}
          >
            {tab.icon}
            {tab.badge > 0 && (
              <span className="sup__nav-badge" aria-hidden="true">
                {tab.badge}
              </span>
            )}
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      <Toast message={toast} onClose={() => setToast(null)} />
    </>
  );
}
