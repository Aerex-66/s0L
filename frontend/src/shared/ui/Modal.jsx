import * as Dialog from '@radix-ui/react-dialog'
import { motion, AnimatePresence } from 'framer-motion'
import { cx } from '../utils/cx'

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
}

const panelVariants = {
  hidden: { opacity: 0, scale: 0.96, y: 12 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', damping: 28, stiffness: 380 } },
  exit: { opacity: 0, scale: 0.97, y: 8, transition: { duration: 0.15 } },
}

export default function Modal({ title, onClose, children, className = '' }) {
  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay asChild>
          <motion.div
            className="modal-overlay"
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={{ duration: 0.15 }}
          />
        </Dialog.Overlay>
        <Dialog.Content
          asChild
          onPointerDownOutside={() => onClose()}
          // The dialog owns this Escape — keep it from also reaching the shell's exit-deal shortcut
          onEscapeKeyDown={(e) => e.stopPropagation()}
        >
          <motion.div
            className={cx('modal-content', className)}
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <div className="modal-header">
              <Dialog.Title asChild>
                <h2>{title}</h2>
              </Dialog.Title>
              <Dialog.Close asChild>
                <button className="close-btn" aria-label="Close modal">
                  &times;
                </button>
              </Dialog.Close>
            </div>
            <div className="modal-body">
              {children}
            </div>
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
