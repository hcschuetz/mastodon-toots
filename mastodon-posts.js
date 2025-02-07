// A Web Component Displaying some User's Mastodon Posts
// -----------------------------------------------------

customElements.define('mastodon-posts', class MastodonPosts extends HTMLElement {
    async connectedCallback() {

      function mkElem(tag, className, content, tweak) {
        const elem = document.createElement(tag);
        elem.className = className;
        elem.innerHTML = content; // TODO sanitize
        tweak?.(elem);
        return elem;
      }

      // It's probably possible to get this formatting with some standard
      // date/time-formatting function, but it's easier to just implement
      // this directly:
      const formatDate = date =>
        date.getFullYear()   .toString().padStart(4, "0") + "-" +
        (date.getMonth() + 1).toString().padStart(2, "0") + "-" +
        date.getDay()        .toString().padStart(2, "0") + " " +
        date.getHours()      .toString().padStart(2, "0") + ":" +
        date.getMinutes()    .toString().padStart(2, "0");

      try {
        const params = [];
        const limitAttr = this.getAttribute("limit");
        if (limitAttr) { params.push(["limit", limitAttr]); }
        if (this.getAttribute("exclude-replies") != null) {
          params.push(["exclude_replies", "true"]);
        }
        if (this.getAttribute("exclude-reblogs") != null) {
          params.push(["exclude_reblogs", "true"]);
        }

        const statusURL = `https://${
          this.getAttribute("instance")
        }/api/v1/accounts/${
          this.getAttribute("id")
        }/statuses${
          params.length === 0 ? "" :
          "?" + params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")
        }`;

        // TODO? update posts repeatedly (asking only for new posts)
        const response = await fetch(statusURL);
        if (!response.ok) {
          // TODO internationalize
          throw `Could not get mastodon posts (HTTP status: ${response.status})`;
        }
        const toots = await response.json();
        if (toots.length === 0) {
          // TODO internationalize
          throw `Nothing to see here.  (Is the account id "${id}" correct?)`;
        }
        this.innerHTML = "";
        for (let toot of toots) {
          // Show boosts as if they were direct:
          toot = toot.reblog ?? toot;

          this.append(mkElem("div", "toot", "", tootElem => {
            tootElem.append(
              mkElem("div", "toot-time", formatDate(new Date(toot.created_at))),
              mkElem("a", "toot-user", "@" + toot.account.acct, a => {
                a.href = toot.account.url;
              }),
              mkElem("div", "toot-content", toot.content),
            );
            toot.media_attachments.forEach(({type, url}) => {
              switch (type) {
                case "image": {
                  tootElem.append(
                    mkElem("img", "toot-image", "", img => { img.src = url; }),
                  );
                  break;
                }
                // TODO support more media types
              }
            });
          }));
        }
      } catch (error) {
        this.append(mkElem("div", "error", error));
      }
    }

    // TODO? React to attribute changes, but it's probably not worthwhile.
});
