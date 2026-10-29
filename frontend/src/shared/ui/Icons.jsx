/**
 * Shared Icon Library — powered by lucide-react
 * Re-exports Lucide icons with the same names the app already uses.
 * All existing imports (SearchIcon, SettingsIcon, etc.) keep working.
 */

import {
  Search,
  Settings,
  Mail,
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
  LayoutDashboard,
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
import excelLogo from '../../assets/module-logos/excel.svg'
import powerpointLogo from '../../assets/module-logos/powerpoint.svg'
import folderLogo from '../../assets/module-logos/folder.svg'
import bobLogo from '../../assets/module-logos/ibm-bob.webp'
import greenstarLogo from '../../assets/module-logos/greenstar.webp'

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
export const MailIcon = wrap(Mail, 12)
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

/** A module's own app mark, bundled with s0L (DESIGN.md brand law 5); full colour, decorative next to its label */
const moduleLogo = (src) => ({ size = 16, className = '' } = {}) => (
  <img src={src} width={size} height={size} alt="" draggable="false" className={className ? `module-logo ${className}` : 'module-logo'} />
)

export const ExcelLogo = moduleLogo(excelLogo)
export const PowerPointLogo = moduleLogo(powerpointLogo)
export const FolderLogo = moduleLogo(folderLogo)
export const BobLogo = moduleLogo(bobLogo)
export const GreenstarLogo = moduleLogo(greenstarLogo)

/** Module navigation icons (used by OpportunityDrawer) */
export const MODULE_ICONS = {
  home:      (p) => <LayoutDashboard size={18} {...p} />,
  gssm:      (p) => <ExcelLogo size={18} {...p} />,
  isbd:      (p) => <PowerPointLogo size={18} {...p} />,
  genai:     (p) => <BobLogo size={21} {...p} />,
  greenstar: (p) => <GreenstarLogo size={19} {...p} />,
  documents: (p) => <FolderLogo size={18} {...p} />,
  metrics:   (p) => <BarChart3 size={18} {...p} />,
  admin:     (p) => <Settings size={18} {...p} />,
}
