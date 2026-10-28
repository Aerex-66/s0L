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
  ChevronLeft,
  ChevronUp,
  ChevronDown,
  Layers,
  User,
  Users,
  Contact,
  Paperclip,
  Link2,
  RefreshCw,
  Wrench,
  GitBranch,
  Box,
  Briefcase,
  Boxes,
  Database,
  Cloud,
  Truck,
  Archive,
  LayoutGrid,
  ArrowLeft,
  Gauge,
  Megaphone,
  ExternalLink,
  X,
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

/** Header controls (icon-only; labels live in tooltips) */
export const ActiveDealsIcon = wrap(Briefcase, 16)
export const ArchiveIcon = wrap(Archive, 16)
export const MyDealsIcon = wrap(User, 16)
export const TeamDealsIcon = wrap(Users, 16)

// Practice emblems (the monday groups) — our own marks, never vendor logos
export const SapPracticeIcon = wrap(Boxes, 14)
export const OraclePracticeIcon = wrap(Database, 14)
export const CrmPracticeIcon = wrap(Cloud, 14)
export const HcmPracticeIcon = wrap(Users, 14)
export const SupplyChainPracticeIcon = wrap(Truck, 14)
export const OtherPracticeIcon = wrap(Briefcase, 14)
export const TilesIcon = wrap(LayoutGrid, 16)
export const MetricsIcon = wrap(BarChart3, 16)
export const ExecIcon = wrap(Gauge, 16)
export const MegaphoneIcon = wrap(Megaphone, 14)
export const ExternalLinkIcon = wrap(ExternalLink, 11)
export const CloseIcon = wrap(X, 12)
export const BackIcon = wrap(ArrowLeft, 16)
export const CloudUploadIcon = wrap(CloudUpload, 12)
export const FolderOpenIcon = wrap(FolderOpen, 14)
export const ChevronRightIcon = wrap(ChevronRight, 14)
export const ChevronLeftIcon = wrap(ChevronLeft, 14)
export const ChevronDownIcon = wrap(ChevronDown, 12)
export const SortAscIcon = wrap(ChevronUp, 12)
export const SortDescIcon = wrap(ChevronDown, 12)
export const LayersIcon = wrap(Layers, 24)
export const UsersIcon = wrap(Users, 24)
export const ContactIcon = wrap(Contact, 24)
export const PaperclipIcon = wrap(Paperclip, 18)
export const ReportChartIcon = wrap(BarChart3, 12)
export const InterfaceLinkIcon = wrap(Link2, 12)
export const ConversionSyncIcon = wrap(RefreshCw, 12)
export const EnhancementWrenchIcon = wrap(Wrench, 12)
export const FormDocIcon = wrap(FileText, 12)
export const WorkflowBranchIcon = wrap(GitBranch, 12)
export const BoxObjectIcon = wrap(Box, 12)

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
