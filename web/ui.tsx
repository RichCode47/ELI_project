import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { AlertCircle, BookOpen, GraduationCap, LoaderCircle, X } from 'lucide-react';
import { formatState } from '../shared/catalog.js';

export function Brand({ compact = false }: { compact?: boolean }) {
  return <div className="brand"><span className="brand-mark"><GraduationCap size={23} strokeWidth={2.4}/></span>
    {!compact && <span>ELI<span className="brand-light"> EdTech</span></span>}</div>;
}
export function Loading() { return <div className="loading" role="status"><LoaderCircle className="spin" size={19}/> Loading workspace</div>; }
export function ErrorMessage({ error, retry }: { error: Error | string; retry?: () => void }) {
  return <div className="error-message" role="alert"><AlertCircle size={18}/><span>{typeof error === 'string' ? error : error.message}</span>
    {retry && <button className="button subtle" onClick={retry}>Retry</button>}</div>;
}
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty"><div className="empty-icon"><BookOpen size={23}/></div><h3>{title}</h3>{children && <p>{children}</p>}</div>;
}
export function Badge({ status }: { status: string }) {
  const good = ['ACTIVE', 'PUBLISHED', 'PRESENT', 'PAID', 'POSTED', 'ACCEPTED', 'RETURNED', 'ENROLLED', 'SENT', 'SUBMITTED', 'REGISTERED'].includes(status);
  const alert = ['ABSENT', 'EXPIRED', 'DECLINED', 'VOID', 'SUSPENDED'].includes(status);
  const soft = ['LATE', 'PENDING', 'TRIAL', 'PART_PAID', 'OPEN', 'ISSUED', 'EXCUSED', 'INVITED'].includes(status);
  return <span className={'badge ' + (good ? 'good' : alert ? 'alert' : soft ? 'soft' : '')}><i/>{formatState(status)}</span>;
}
export function Dialog({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, []);
  return createPortal(<dialog ref={ref} className={'dialog' + (wide ? ' wide' : '')} aria-labelledby="dialog-title"
    onCancel={(event) => { event.preventDefault(); close.current(); }}>
    <div className="dialog-head"><h2 id="dialog-title">{title}</h2><button aria-label="Close dialog" className="icon-button" onClick={onClose}><X size={20}/></button></div>
    {children}
  </dialog>, document.body);
}
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}
export const getError = (error: unknown) => error instanceof Error ? error : new Error('Something went wrong.');
