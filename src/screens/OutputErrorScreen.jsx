import ReportForm from '../components/ReportForm.jsx';
import ReportShell from '../components/ReportShell.jsx';
import { AlertTriangleIcon } from '../components/icons.jsx';
import { useI18n } from '../i18n.jsx';

export default function OutputErrorScreen({ onBack }) {
  const { t } = useI18n();

  return (
    <ReportShell theme="green">
      <ReportForm
        category="output-errors"
        icon={<AlertTriangleIcon size={34} />}
        title={t('outputErrors')}
        subtitle={t('outputErrorsSub')}
        onBack={onBack}
      />
    </ReportShell>
  );
}