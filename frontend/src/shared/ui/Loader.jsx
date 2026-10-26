/**
 * Shared loading state components.
 *
 * <Loader />           – inline spinner text
 * <Loader.Page />      – full-screen pulse (app boot)
 * <Loader.Module />    – module/tab placeholder
 */

export default function Loader({ text = 'Loading...' }) {
  return <div className="loading">{text}</div>
}

function PageLoader({ text = 'Loading s0L...' }) {
  return (
    <div className="app-loading">
      <div className="app-loading-pulse" />
      <span>{text}</span>
    </div>
  )
}

function ModuleLoader({ text = 'Loading module...' }) {
  return <div className="loading">{text}</div>
}

Loader.Page = PageLoader
Loader.Module = ModuleLoader
