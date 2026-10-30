/**
 * WorkUpdateReminder.jsx — the "Work update needed" reminder (mockup 6.2):
 * a soft peach card with the title, the "send a photo or video to
 * supervisor" line, a solid blue "Send Update" button and a close (×).
 *
 * Part 4: the worker attaches a photo/video (metadata only — nothing is
 * uploaded) before sending. The attachment is MANDATORY: tapping
 * "Send Update" without one is blocked with a validation message, exactly
 * like the issue-report screens. After sending, the modal shows a
 * confirmation stage ("Update sent!") with a Done button.
 *
 * The homepage pops it up on the demo interval (see utils/shift.js) and
 * persists the update through onSend — the modal itself stays storage-free.
 *
 * Props:
 *  - open               whether the reminder is visible
 *  - onClose()          dismissed without sending (snoozes the reminder)
 *  - onSend(attachment) "Send Update" tapped with a file attached;
 *                       attachment is the file's metadata
 *                       ({ name, type, size }) — never null
 */

import { useRef, useState } from 'react';
import { useI18n } from '../i18n.jsx';
import { CameraIcon, CheckCircleIcon, XIcon } from './icons.jsx';

/** Build mock attachment metadata from a picked file (no real upload). */
function fileMeta(file) {
  if (!file) return null;
  return { name: file.name, type: file.type || 'unknown', size: file.size };
}

export default function WorkUpdateReminder({ open, onClose, onSend }) {
  const { t } = useI18n();

  // The picked photo/video's metadata, the "attachment required" validation
  // message, and whether the update was sent.
  const [attachment, setAttachment] = useState(null);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  // Hidden <input type="file"> — the visible pill button triggers it.
  const fileInputRef = useRef(null);

  // Every time the reminder pops, start from a clean slate (the component
  // stays mounted, so state would otherwise survive between pop-ups).
  // This is React's documented "adjust state when a prop changes" pattern:
  // compare with the previous `open` during render and reset if it changed.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setAttachment(null);
      setError('');
      setSent(false);
    }
  }

  if (!open) return null;

  /** Keep only the picked file's metadata; reset the input so the same
      file can be picked again after a remove. Picking a file also clears
      the "attachment required" validation message. */
  function handlePickFile(event) {
    const file = event.target.files?.[0];
    setAttachment(fileMeta(file));
    setError('');
    event.target.value = '';
  }

  /** The attachment is mandatory — sending without one is blocked with a
      clear message. With a file attached, hand it to the homepage (which
      persists the update) and switch the modal to its confirmation stage. */
  function handleSend() {
    if (!attachment) {
      setError(t('attachmentRequired'));
      return;
    }
    onSend(attachment);
    setSent(true);
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="update-reminder"
        role="dialog"
        aria-modal="true"
        aria-label={t('workUpdateNeeded')}
        onClick={(event) => event.stopPropagation()}
      >
        {!sent && (
          <button
            type="button"
            className="modal__close"
            aria-label={t('close')}
            onClick={onClose}
          >
            <XIcon size={18} />
          </button>
        )}

        {sent ? (
          /* ---- confirmation stage ---- */
          <>
            <span className="update-reminder__icon update-reminder__icon--sent" aria-hidden="true">
              <CheckCircleIcon size={26} />
            </span>
            <div className="update-reminder__text">
              <h2 className="modal__title">{t('updateConfirmTitle')}</h2>
              <p className="modal__subtitle">{t('updateConfirmSub')}</p>
            </div>
            <button
              type="button"
              className="update-reminder__send"
              onClick={onClose}
            >
              {t('done')}
            </button>
          </>
        ) : (
          /* ---- ask stage: attach (MANDATORY) + send ---- */
          <>
            <span className="update-reminder__icon" aria-hidden="true">
              <CameraIcon size={26} />
            </span>

            <div className="update-reminder__text">
              <h2 className="modal__title">{t('workUpdateNeeded')}</h2>
              <p className="modal__subtitle">{t('sendPhotoVideo')}</p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              className="report__file-input"
              onChange={handlePickFile}
              tabIndex={-1}
              aria-hidden="true"
            />
            {attachment ? (
              <div className="report__attachment">
                <span className="report__attachment-icon" aria-hidden="true">
                  <CameraIcon size={18} />
                </span>
                <span className="report__attachment-name">{attachment.name}</span>
                <button
                  type="button"
                  className="report__attachment-remove"
                  aria-label={t('removeFile')}
                  onClick={() => setAttachment(null)}
                >
                  <XIcon size={14} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                className={
                  'report__pick update-reminder__pick' +
                  (error ? ' report__pick--error' : '')
                }
                onClick={() => fileInputRef.current?.click()}
              >
                <CameraIcon size={20} />
                <span>{t('chooseFile')}</span>
              </button>
            )}
            {error && <p className="field__error">{error}</p>}

            <button
              type="button"
              className="update-reminder__send"
              onClick={handleSend}
            >
              {t('sendUpdate')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
