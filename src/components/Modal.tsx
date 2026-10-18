import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function Modal({open, onClose, title, children, wide=false}: {open:boolean; onClose:()=>void; title:string; children:ReactNode; wide?:boolean}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    if (open && !dialog.open) { dialog.showModal(); window.dispatchEvent(new Event('motion-dialog-open')); }
    if (!open && dialog.open) dialog.close();
    if (open) { const prior = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = prior; }; }
  }, [open]);
  return <dialog ref={ref} className={`modal ${wide?'modal-wide':''}`} aria-label={title} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
    {open && <div className="modal-content"><div className="modal-heading"><h2>{title}</h2><button data-hand className="icon-button" aria-label={`${title} 닫기`} onClick={onClose}><X/></button></div>{children}</div>}
  </dialog>;
}
