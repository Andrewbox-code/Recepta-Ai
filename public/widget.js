/**
 * Recepta AI embeddable chat widget.
 *
 * Drop this on any page:
 *   <script src="https://YOUR-SITE.netlify.app/widget.js" data-business="+15551234567"></script>
 *
 * data-business must match the exact key used for this business in
 * /admin.html (its Twilio number). The widget figures out where to send
 * chat messages from its own <script src>, so the same snippet works
 * unmodified on any customer's site.
 */
;(function () {
  var scriptEl = document.currentScript
  if (!scriptEl) {
    var scripts = document.getElementsByTagName('script')
    for (var i = scripts.length - 1; i >= 0; i--) {
      if (/widget\.js(\?|$)/.test(scripts[i].src)) {
        scriptEl = scripts[i]
        break
      }
    }
  }
  if (!scriptEl) return

  var businessKey = scriptEl.getAttribute('data-business') || ''
  var origin
  try {
    origin = new URL(scriptEl.src, window.location.href).origin
  } catch {
    return
  }

  // Every non-ASCII character used below is written as a \u escape
  // (not a raw byte) so the widget renders correctly even if it's ever
  // served without an explicit UTF-8 charset somewhere in the chain --
  // this file is deliberately pure ASCII source.
  var EM_DASH = '\u2014'
  var CHAT_EMOJI = '\u{1F4AC}'
  var CLOSE_X = '\u2715'
  var SEND_ARROW = '\u27A4'
  var ELLIPSIS = '\u2026'

  var FALLBACK_REPLY = "Thanks for your message " + EM_DASH + " we'll get back to you shortly."
  var messages = []
  var open = false
  var sending = false

  var style = document.createElement('style')
  style.textContent =
    '.recepta-bubble{position:fixed;bottom:20px;right:20px;width:58px;height:58px;border-radius:999px;' +
    'background:#7c6cff;color:#fff;border:none;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.25);' +
    'z-index:2147483000;display:flex;align-items:center;justify-content:center;font-size:26px;}' +
    '.recepta-bubble:hover{background:#9b8dff;}' +
    '.recepta-panel{position:fixed;bottom:90px;right:20px;width:340px;max-width:calc(100vw - 40px);' +
    'height:460px;max-height:calc(100vh - 120px);background:#0a0d1c;color:#f7f7fc;border-radius:16px;' +
    'box-shadow:0 12px 40px rgba(0,0,0,.35);display:none;flex-direction:column;overflow:hidden;' +
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;z-index:2147483000;}' +
    '.recepta-panel.recepta-open{display:flex;}' +
    '.recepta-header{padding:14px 16px;background:#131834;font-weight:600;font-size:14px;' +
    'border-bottom:1px solid rgba(247,247,252,.1);display:flex;justify-content:space-between;align-items:center;}' +
    '.recepta-close{background:none;border:none;color:#b3b6d6;cursor:pointer;font-size:18px;line-height:1;padding:2px 6px;}' +
    '.recepta-messages{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:8px;font-size:13px;}' +
    '.recepta-msg{max-width:85%;padding:8px 12px;border-radius:14px;line-height:1.4;}' +
    '.recepta-msg-ai{align-self:flex-start;background:#1b2145;border-bottom-left-radius:4px;}' +
    '.recepta-msg-user{align-self:flex-end;background:rgba(45,212,191,.15);border-bottom-right-radius:4px;}' +
    '.recepta-inputrow{display:flex;gap:8px;padding:12px;border-top:1px solid rgba(247,247,252,.1);background:#131834;}' +
    '.recepta-input{flex:1;background:#05060f;border:1px solid rgba(247,247,252,.15);border-radius:999px;' +
    'padding:8px 12px;color:#f7f7fc;font-size:13px;outline:none;}' +
    '.recepta-send{background:#7c6cff;border:none;border-radius:999px;color:#fff;width:34px;height:34px;' +
    'cursor:pointer;flex-shrink:0;}' +
    '.recepta-footer{text-align:center;font-size:10px;color:#6b7094;padding:4px 0 8px;}' +
    '.recepta-footer a{color:#9b8dff;text-decoration:none;}'
  document.head.appendChild(style)

  var bubble = document.createElement('button')
  bubble.className = 'recepta-bubble'
  bubble.setAttribute('aria-label', 'Chat with us')
  bubble.textContent = CHAT_EMOJI

  var panel = document.createElement('div')
  panel.className = 'recepta-panel'
  panel.innerHTML =
    '<div class="recepta-header"><span>Chat with us</span><button class="recepta-close" aria-label="Close chat">' +
    CLOSE_X +
    '</button></div>' +
    '<div class="recepta-messages"></div>' +
    '<div class="recepta-inputrow">' +
    '<input class="recepta-input" type="text" placeholder="Type a message' +
    ELLIPSIS +
    '" />' +
    '<button class="recepta-send" aria-label="Send">' +
    SEND_ARROW +
    '</button>' +
    '</div>' +
    '<div class="recepta-footer">Powered by <a href="https://recepta-ai.netlify.app" target="_blank" rel="noopener">Recepta AI</a></div>'

  document.body.appendChild(bubble)
  document.body.appendChild(panel)

  var messagesEl = panel.querySelector('.recepta-messages')
  var inputEl = panel.querySelector('.recepta-input')
  var sendBtn = panel.querySelector('.recepta-send')
  var closeBtn = panel.querySelector('.recepta-close')

  function addMessage(from, text) {
    var el = document.createElement('div')
    el.className = 'recepta-msg ' + (from === 'user' ? 'recepta-msg-user' : 'recepta-msg-ai')
    el.textContent = text
    messagesEl.appendChild(el)
    messagesEl.scrollTop = messagesEl.scrollHeight
  }

  function togglePanel() {
    open = !open
    panel.classList.toggle('recepta-open', open)
    if (open && messages.length === 0) {
      var greeting = 'Hi! What can I help you with today?'
      messages.push({ role: 'assistant', content: greeting })
      addMessage('ai', greeting)
    }
    if (open) inputEl.focus()
  }

  bubble.addEventListener('click', togglePanel)
  closeBtn.addEventListener('click', togglePanel)

  function send() {
    var text = inputEl.value.trim()
    if (!text || sending) return
    inputEl.value = ''
    messages.push({ role: 'user', content: text })
    addMessage('user', text)
    sending = true

    fetch(origin + '/.netlify/functions/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: messages, business: businessKey }),
    })
      .then(function (res) {
        if (!res.ok) throw new Error('bad status ' + res.status)
        return res.json()
      })
      .then(function (data) {
        var reply = data && data.reply ? data.reply : FALLBACK_REPLY
        messages.push({ role: 'assistant', content: reply })
        addMessage('ai', reply)
      })
      .catch(function () {
        addMessage('ai', FALLBACK_REPLY)
      })
      .finally(function () {
        sending = false
      })
  }

  sendBtn.addEventListener('click', send)
  inputEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') send()
  })
})()
