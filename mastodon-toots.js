
function mkElem(tag, className, content, tweak) {
  const elem = document.createElement(tag);
  elem.className = className;
  elem.textContent = content;
  tweak?.(elem);
  return elem;
}

const mkLink = (class_, href, content, tweak) =>
  mkElem("a", class_, content, el => {
    el.href = href;
    el.target = "_blank";
    el.rel = "noopener noreferrer";
    tweak?.(el);
});

const displayName = ({display_name, emojis}) => {
  // See the "reference implementation" at
  // https://github.com/mastodon/mastodon/blob/1cf30717dbe7a0038a645c62f19deef7efc42207/app/javascript/mastodon/features/emoji/emoji.js#L30
  const emojiObj =
    Object.fromEntries(emojis.map(({shortcode, url}) => [shortcode, url]));

  const result = new DocumentFragment();
  let prev = 0;
  for (const match of display_name.matchAll(/:([^:]*):/gi)) {
    result.append(display_name.substring(prev, match.index));
    prev = match.index + match[0].length;

    const url = emojiObj[match[1]];
    result.append(!url ? match[0] : mkElem("img", "emoji", "", img => {
      img.src = url;
      img.title = match[0];
    }));
  }
  result.append(display_name.substring(prev));
  return result;
}

const domParser = new DOMParser();

/**
 * A positive list of allowed tags and attribute names.
 * 
 * This is quite restrictive and might need to be extended.
 * OTOH we might also restrict the attribute values.
 */
const allowed = {
  A: ["class", "href", "rel", "target", "translate"],
  B: [],
  BR: [],
  I: [],
  EM: [],
  P: [],
  SPAN: ["class", "translate"],
};

/**
 * Check a DOM subtree for illegal content.
 * 
 * Does not fix the tree by removing bad parts, but simply throws.
 */
function sanitize({tagName, attributes, children}) {
  const allowedAttrs = allowed[tagName];
  if (!allowedAttrs) {
    throw "sanitize: unexpected node tag " + tagName;
  }
  for (const {name} of attributes) {
    if (!allowedAttrs.includes(name)) {
      throw `sanitize: attribute "${name}" not allowed in ${tagName} element`;
    }
  }
  for (const child of children) {
    sanitize(child);
  }
}

/** Format date as YYYY-MM-DD HH:mm */
const formatDate = date =>
  // Is there a simpler way to implement this without using third-party code
  // such as moment.js?
  date.getFullYear()   .toString().padStart(4, "0") + "-" +
  (date.getMonth() + 1).toString().padStart(2, "0") + "-" +
  date.getDate()       .toString().padStart(2, "0") + " " +
  date.getHours()      .toString().padStart(2, "0") + ":" +
  date.getMinutes()    .toString().padStart(2, "0");

/** A Web Component Displaying some User's Mastodon Toots */
export default
class MastodonToots extends HTMLElement {
  async connectedCallback() {
    try {
      const response = await fetch(this.getAttribute("url"));
      if (!response.ok) {
        // TODO internationalize
        throw `Could not get mastodon toots (HTTP status: ${response.status})`;
      }
      const toots = await response.json();
      if (toots.length === 0) {
        // TODO internationalize
        throw `Nothing to see here.  (Is the account id "${id}" correct?)`;
      }
      this.innerHTML = "";
      for (let toot of toots) {
        this.emitToot(toot);
      }
    } catch (error) {
      this.append(mkElem("div", "error", error));
    }
  }

  emitToot(toot) {
    try {
      // Show boosts as if they were direct toots:
      toot = toot.reblog ?? toot;

      this.append(mkElem("div", "toot", "", tootElem => {
        tootElem.append(
          mkLink("toot-link", toot.url, "🔗"),
          mkElem("span", "toot-time", formatDate(new Date(toot.created_at))),
          mkElem("div", "toot-author", "", el => el.append(
            mkLink("toot-avatar-link", toot.account.avatar, "", a => {
              a.append(mkElem("img", "toot-avatar", "", img => {
                img.src = toot.account.avatar;
                // TODO internationalize
                img.title = `avatar of user @${toot.account.username}`;
              }));
            }),
            mkElem("div", "toot-display-name", "", el => {
              el.append(displayName(toot.account));
            }),
            mkLink("toot-user", toot.account.url, "@" + toot.account.acct),
          )),
          ...toot.spoiler_text ? [
            mkElem("p", "spoiler-text", toot.spoiler_text),
          ] : [],
          ...toot.sensitive ? [
            // TODO internationalize
            mkElem("button", "toot-show-sensitive", "show/hide content", button => {
                button.addEventListener("click", () => {
                  tootElem.querySelector(".toot-content").classList.toggle("hidden");
                },
              );
            }),
          ] : [],
          mkElem("div", "toot-content", "", contentElem => {
            if (toot.sensitive) {
              contentElem.classList.add("hidden");
            }
            const doc = domParser.parseFromString(toot.content, "text/html");
            for (const child of [...doc.body.children]) {
              sanitize(child);
              contentElem.append(child);
            }

            function attach(preview_url, description, link_url) {
              contentElem.append(
                // Simply open the url in a new tab:
                mkLink("toot-image-link", link_url, "", a => {
                  a.append(mkElem("img", "toot-image", "", img => {
                    img.src = preview_url;
                    img.title = description ?? "";
                  }));
                }),
              );
            }

            toot.media_attachments.forEach(attachment => {
              const {type, url, preview_url, description} = attachment;
              switch (type) {
                case "image":
                case "gifv": {
                  attach(preview_url, description, url);
                  break;
                }
                case "video": {
                  contentElem.append(
                    mkElem("video", "toot-video", "", el => {
                      el.src = url;
                      el.poster = preview_url;
                      el.controls = true;
                      el.title = description ?? "";
                    }),
                  );
                  break;
                }
                // TODO support more media types
                case "unknown": {
                  // An incompatibility between mastodon instances?
                  // But we might be able to use a remote_url:
                  const {remote_url} = attachment;
                  if (remote_url) {
                    console.warn("attachment with unknown type:", attachment);
                    attach(remote_url, description, remote_url);
                    break;
                  }
                  // ...else fall through
                }
                default: {
                  console.error("unsupported attachment:", attachment);
                  contentElem.append(mkLink("toot-attachment-link", url, `[${type} attachment]`));
                  break;
                }
              }
            });
          }),
        );
      }));
    } catch (error) {
      console.error(error, toot);
      this.append(mkElem("div", "toot error", "could not render toot"));
    }
  }
};

customElements.define('mastodon-toots', MastodonToots);
