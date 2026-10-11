/*
 * Zen-style vertical tabbar behavior (non-mac only):
 *  - hover to expand: the glass sidebar grows from --sidebar-collapsed-width
 *    to --sidebar-expanded-width and OVERLAYS the page (the webview bounds
 *    never change, see webviews.getViewBounds which always reserves only
 *    the collapsed width),
 *  - drag-to-resize: an invisible handle on the right edge of the panel
 *    lets the user pick the expanded width; the value is written into the
 *    --sidebar-expanded-width CSS variable and persisted in settings
 *    ("verticalTabbarWidth").
 */

const settings = require('util/settings/settings.js')

const EXPANDED_CLASS = 'sidebar-expanded'
const RESIZING_CLASS = 'sidebar-resizing'
const MIN_EXPANDED_WIDTH = 140
const MAX_EXPANDED_WIDTH = 480
const DEFAULT_EXPANDED_WIDTH = 250

// small delay so quick mouse passes across the edge don't flicker the panel
const EXPAND_DELAY_MS = 60
const COLLAPSE_DELAY_MS = 240

function getCollapsedWidth () {
  return parseInt(getComputedStyle(document.body).getPropertyValue('--sidebar-collapsed-width'), 10) || 60
}

function clampExpandedWidth (px) {
  const max = Math.max(MIN_EXPANDED_WIDTH, Math.min(MAX_EXPANDED_WIDTH, window.innerWidth * 0.5))
  // never allow the expanded panel to be narrower than the reserved strip
  return Math.round(Math.max(Math.max(MIN_EXPANDED_WIDTH, getCollapsedWidth()), Math.min(max, px)))
}

function applyExpandedWidth (px) {
  const w = clampExpandedWidth(px)
  document.body.style.setProperty('--sidebar-expanded-width', w + 'px')
  return w
}

function initialize () {
  if (document.body.classList.contains('mac')) {
    return // classic horizontal top bar on mac — nothing to do
  }

  const navbar = document.getElementById('navbar')
  const handle = document.getElementById('sidebar-resize-handle')

  /* ---------- restore persisted expanded width ---------- */

  settings.listen('verticalTabbarWidth', function (value) {
    if (value) {
      applyExpandedWidth(value)
    }
  })

  /* ---------- hover expand / collapse ---------- */

  let expandTimer = null
  let collapseTimer = null
  let isDragging = false

  function setExpanded (expanded) {
    document.body.classList.toggle(EXPANDED_CLASS, expanded)
  }

  function requestExpand () {
    clearTimeout(collapseTimer)
    if (document.body.classList.contains(EXPANDED_CLASS)) {
      return
    }
    clearTimeout(expandTimer)
    expandTimer = setTimeout(function () {
      setExpanded(true)
    }, EXPAND_DELAY_MS)
  }

  function requestCollapse () {
    clearTimeout(expandTimer)
    if (!document.body.classList.contains(EXPANDED_CLASS)) {
      return
    }
    clearTimeout(collapseTimer)
    collapseTimer = setTimeout(function () {
      if (!isDragging && !navbar.matches(':hover')) {
        setExpanded(false)
      }
    }, COLLAPSE_DELAY_MS)
  }

  navbar.addEventListener('mouseenter', requestExpand)
  navbar.addEventListener('mouseleave', requestCollapse)

  if (handle) {
    handle.addEventListener('mouseenter', requestExpand)
    handle.addEventListener('mouseleave', requestCollapse)
  }

  /* ---------- drag to resize ---------- */

  if (handle) {
    handle.addEventListener('mousedown', function (e) {
      if (e.button !== 0) {
        return
      }
      e.preventDefault()
      e.stopPropagation()

      isDragging = true
      clearTimeout(expandTimer)
      clearTimeout(collapseTimer)
      setExpanded(true)
      document.body.classList.add(RESIZING_CLASS)

      function onMouseMove (moveEvent) {
        applyExpandedWidth(moveEvent.clientX)
      }

      function onMouseUp () {
        isDragging = false
        document.body.classList.remove(RESIZING_CLASS)
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)

        const current = parseInt(getComputedStyle(document.body).getPropertyValue('--sidebar-expanded-width'), 10)
        if (current) {
          settings.set('verticalTabbarWidth', current)
        }

        // the webview bounds only depend on the collapsed width, so no
        // relayout is needed here — but keep the selected view in sync
        // with the reserved strip just in case margins changed elsewhere
        require('webviews.js').resize()

        // if the pointer ended outside the panel, collapse it again
        if (!navbar.matches(':hover') && !handle.matches(':hover')) {
          requestCollapse()
        }
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    })

    // double-click the edge -> back to the default expanded width
    handle.addEventListener('dblclick', function (e) {
      e.preventDefault()
      applyExpandedWidth(DEFAULT_EXPANDED_WIDTH)
      settings.set('verticalTabbarWidth', DEFAULT_EXPANDED_WIDTH)
    })
  }

  /* ---------- keyboard escape hatch (Ctrl+Shift+B toggles expansion) ---------- */

  window.addEventListener('keydown', function (e) {
    if (e.ctrlKey && e.shiftKey && (e.code === 'BracketLeft' || e.code === 'KeyB')) {
      setExpanded(!document.body.classList.contains(EXPANDED_CLASS))
    }
  })
}

module.exports = { initialize }
