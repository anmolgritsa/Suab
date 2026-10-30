import ReportForm from '../components/ReportForm.jsx';
import ReportShell from '../components/ReportShell.jsx';
import { PackageIcon } from '../components/icons.jsx';
import { useI18n } from '../i18n.jsx';

export default function InputErrorScreen({ onBack }) {
  const { t } = useI18n();

  return (
    <ReportShell theme="amber">
      <ReportForm
        category="input-errors"
        icon={<PackageIcon size={34} />}
        title={t('inputErrors')}
        subtitle={t('inputErrorsSub')}
        onBack={onBack}
      />
    </ReportShell>
  );
}