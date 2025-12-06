/**
 * Create an element with properties and children.
 * 
 * For convenience:
 * - Instead of `ELEM("div", {className: "foo bar"})` you can write `ELEM("div.foo.bar")`.
 * - Use the optional `tweak` function if you need to apply more complex code to the new element.
 */
function ELEM(tagAndClasses, props = {}, children = [], tweak) {
  const [tag, ...classes] = tagAndClasses.split(".");
  const elem = Object.assign(document.createElement(tag), props);
  for (const c of classes) {
    elem.classList.add(c);
  }
  elem.append(...children.filter(x => x)); // removing falsy elements for convenience
  tweak?.(elem);
  return elem;
}

const LINK = (className, href, content) =>
  ELEM("a", {className, href, target: "_blank", rel: "noopener noreferrer"}, content);

/**
 * Expand emojis in the `display_name` of an account
 * @returns a DOM fragment.
 */
function displayName({display_name, emojis}) {
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
    result.append(!url ? match[0] : ELEM("img.emoji", {src: url, title: match[0]}));
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
  EM: [],
  BR: [],
  I: [],
  LI: [],
  P: ["class"],
  SPAN: ["class", "translate"],
  STRONG: [],
  UL: [],
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

function sanitized(html) {
  const out = new DocumentFragment();
  const doc = domParser.parseFromString(html, "text/html");
  for (const child of [...doc.body.children]) {
    sanitize(child);
    out.append(child);
  }
  return out;
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
      this.append(ELEM("div.error", {}, [String(error)]));
    }
  }

  emitToot(toot) {
    try {
      // Show boosts as if they were direct toots:
      toot = toot.reblog ?? toot;
      // This makes sense in the original use case where the feed is from
      // a single account, but not necessarily in other feeds.
      // TODO optionally show reblogger info.

      /** the toot-content element, if the toot is sensitive */
      let hidable;

      this.append(ELEM("div.toot", {}, [
        LINK("toot-link", toot.url, ["🔗"]),
        ELEM("span.toot-time", {}, [formatDate(new Date(toot.created_at))]),
        ELEM("div.toot-author", {}, [
          LINK("toot-avatar-link", toot.account.avatar, [
            ELEM("img.toot-avatar", {
              src: toot.account.avatar,
              // TODO internationalize
              title: `avatar of user @${toot.account.username}`,
            }),
          ]),
          ELEM("div.toot-display-name", {}, [displayName(toot.account)]),
          LINK("toot-user", toot.account.url, ["@", toot.account.acct]),
        ]),
        ...toot.spoiler_text ? [
          ELEM("p.spoiler-text", {}, [toot.spoiler_text]),
        ] : [],
        ...toot.sensitive ? [
          ELEM("button.toot-show-sensitive", {}, [
            // TODO internationalize
            "show/hide content"
          ], button => {
              button.addEventListener("click", () => {
                hidable.classList.toggle("hidden");
              },
            );
          }),
        ] : [],
        ELEM("div.toot-body", {}, [], bodyElem => {
          if (toot.sensitive) {
            bodyElem.classList.add("hidden");
            hidable = bodyElem;
          }
          bodyElem.append(
            ELEM("div.toot-content", {}, [sanitized(toot.content)]),
          );

          function attach(preview_url, description, link_url) {
            bodyElem.append(
              // Simply open the url in a new tab:
              LINK("toot-image-link", link_url, [
                ELEM("img.toot-image", {src: preview_url, title: description ?? ""}, []),
              ]),
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
                bodyElem.append(
                  ELEM("video.toot-video", {
                    src: url,
                    poster: preview_url,
                    controls: true,
                    title: description ?? "",
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
                bodyElem.append(LINK("toot-attachment-link", url, [
                  `[${type} attachment]`,
                ]));
                break;
              }
            }
          });

          if (toot.poll) {
            const {
              options, votes_count, expired, expires_at, multiple, voters_count,
            } = toot.poll;
            const maxCount = Math.max(...options.map(o => o.votes_count));
            bodyElem.append(
              ELEM("div.poll", {}, [
                ELEM("div.poll-grid", {}, options.flatMap(o => {
                  const maxClass = o.votes_count === maxCount ? ".poll-max" : "";
                  return [
                    ELEM("div.poll-option" + maxClass, {}, [o.title]),
                    ELEM("div.poll-count" + maxClass, {}, [`${o.votes_count}/${votes_count}`]),
                  ];
                })),
                ...multiple ? [
                  ELEM("div.poll-voters", {}, [`${voters_count}`]),
                ] : [],
                ELEM("div.poll-expiry" + (expired ? ".poll-expired" : ""), {}, [
                  formatDate(new Date(expires_at)),
                ]),
                // Debug:
                // ELEM("pre", {textContent: JSON.stringify(poll, null, 2)}, []),
              ])
            );
          }

          const {card} = toot;
          if (card) {
            try {
              const {type, url, description, title, image, image_description, html, authors, } = card;
              bodyElem.append(
                // TODO use type?  What to do for a video? Embed?
                LINK("card", url, [
                  image && ELEM("img", {src: image, title: image_description ?? ""}),
                  title && ELEM("header.title", {}, [title]),
                  description && ELEM("p.description", {}, [description]),
                  // The html element might contain <iframe>s with many attributes.
                  // html & sanitized(html),
                  ...(authors ?? []).map(author =>
                    author.name && LINK("card-author", author.url, [author.name])
                  ),
                ]),
              );
            } catch (e) {
              console.error(e);
              bodyElem.append(
                ELEM("div.card.error", {}, ["could not render card: " + e]),
              )
            }
          }
        }),
      ]));
    } catch (error) {
      console.error(error, toot);
      this.append(ELEM("div.toot.error", {}, [
        // TODO internationalize
        "could not render toot",
      ]));
    }
  }
};

customElements.define('mastodon-toots', MastodonToots);
