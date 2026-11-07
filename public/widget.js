/*
 * Fidera website chat. Paste on a site:
 *   <script src="https://YOUR-APP/widget.js" data-key="YOUR-CHAT-KEY" async></script>
 * Optional: data-color="#6d28d9" for the button.
 */
(function () {
  var script = document.currentScript;
  if (!script || window.__fideraWebchat) return;
  window.__fideraWebchat = true;
  var key = script.getAttribute("data-key");
  if (!key || !/^[0-9a-f]{32}$/.test(key)) return;
  var origin = new URL(script.src).origin;
  var color = /^#[0-9a-fA-F]{6}$/.test(script.getAttribute("data-color") || "") ? script.getAttribute("data-color") : "#6d28d9";

  var button = document.createElement("button");
  button.type = "button";
  button.setAttribute("aria-label", "Abrir o chat");
  button.setAttribute("aria-expanded", "false");
  button.style.cssText =
    "position:fixed;right:20px;bottom:20px;z-index:2147483646;width:56px;height:56px;border:0;border-radius:50%;cursor:pointer;" +
    "background:" + color + ";color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.2);display:grid;place-items:center;";
  button.innerHTML =
    '<svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

  var frame = null;
  function place() {
    if (!frame) return;
    var small = window.innerWidth < 480;
    frame.style.cssText = small
      ? "position:fixed;inset:0;width:100%;height:100%;border:0;z-index:2147483647;background:#fff;"
      : "position:fixed;right:20px;bottom:88px;width:370px;height:560px;max-height:calc(100vh - 110px);border:0;border-radius:16px;" +
        "box-shadow:0 12px 40px rgba(0,0,0,.25);z-index:2147483647;background:#fff;";
  }
  function toggle(open) {
    if (open && !frame) {
      frame = document.createElement("iframe");
      frame.src = origin + "/w/" + key;
      frame.title = "Chat";
      document.body.appendChild(frame);
    }
    if (frame) {
      place();
      frame.style.display = open ? "block" : "none";
    }
    button.setAttribute("aria-expanded", open ? "true" : "false");
    button.setAttribute("aria-label", open ? "Fechar o chat" : "Abrir o chat");
  }

  button.addEventListener("click", function () {
    toggle(button.getAttribute("aria-expanded") !== "true");
  });
  window.addEventListener("message", function (event) {
    if (event.origin === origin && event.data === "fidera-webchat-close") toggle(false);
  });
  window.addEventListener("resize", place);
  document.body.appendChild(button);
})();
