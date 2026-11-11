import ReportForm from '../components/ReportForm.jsx';
import ReportShell from '../components/ReportShell.jsx';
import { WrenchIcon } from '../components/icons.jsx';
import { useI18n } from '../i18n.jsx';

export default function MachineDefectScreen({ onBack }) {
  const { t } = useI18n();

  return (
    <ReportShell theme="blue">
      <ReportForm
        category="machine-defect"
        icon={<WrenchIcon size={34} />}
        title={t('machineDefect')}
        subtitle={t('machineDefectSub')}
        onBack={onBack}
      />
    </ReportShell>
  );
}