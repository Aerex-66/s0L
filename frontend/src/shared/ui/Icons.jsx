/**
 * Shared Icon Library — powered by lucide-react
 * Re-exports Lucide icons with the same names the app already uses.
 * All existing imports (SearchIcon, SettingsIcon, etc.) keep working.
 */

import {
  Search,
  Settings,
  Upload,
  ArrowUpFromLine,
  Download,
  Check,
  Plus,
  Trash2,
  AlertCircle,
  Folder,
  FolderOpen,
  FileUp,
  SquarePen,
  Home,
  Table2,
  Image,
  Star,
  FileText,
  BarChart3,
  CloudUpload,
  ChevronRight,
} from 'lucide-react'

// Wrapper to match our old API: { size, className } with sensible defaults
const wrap = (LucideIcon, defaultSize = 16) => {
  const Wrapped = ({ size = defaultSize, className = '', ...rest }) => (
    <LucideIcon size={size} className={className} {...rest} />
  )
  Wrapped.displayName = LucideIcon.displayName || LucideIcon.name
  return Wrapped
}

export const SearchIcon = wrap(Search, 16)
export const SettingsIcon = wrap(Settings, 16)
export const UploadIcon = wrap(Upload, 16)
export const UploadSmallIcon = wrap(ArrowUpFromLine, 13)
export const DownloadIcon = wrap(Download, 11)
export const CheckIcon = wrap(Check, 12)
export const PlusIcon = wrap(Plus, 11)
export const TrashIcon = wrap(Trash2, 11)
export const AlertIcon = wrap(AlertCircle, 64)
export const FolderIcon = wrap(Folder, 24)
export const FileDropIcon = wrap(FileUp, 20)
export const EditIcon = wrap(SquarePen, 16)
export const CloudUploadIcon = wrap(CloudUpload, 12)
export const FolderOpenIcon = wrap(FolderOpen, 14)
export const ChevronRightIcon = wrap(ChevronRight, 14)

/** Module navigation icons (used by OpportunityDrawer) */
export const MODULE_ICONS = {
  home:      (p) => <Home size={14} {...p} />,
  gssm:      (p) => <Table2 size={14} {...p} />,
  isbd:      (p) => <Image size={14} {...p} />,
  greenstar: (p) => <Star size={14} {...p} />,
  documents: (p) => <FileText size={14} {...p} />,
  metrics:   (p) => <BarChart3 size={14} {...p} />,
  admin:     (p) => <Settings size={14} {...p} />,
}
