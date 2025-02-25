const input = document.querySelector("#account_input");
const output = document.querySelector('#account_id');
input.addEventListener("change", lookupAccountId);

function lookupAccountId(event) {
  const {value} = event.target;
  const parts = value.trim().split('@');
  if (parts[0] === '') {
    parts.shift();
  }
  if (parts.length !== 2) {
    output.value = `Unexpected account syntax: "${value}"`;
    return;
  }
  const [username, instance] = parts;
  (async function() {
    try {
      output.value = `Contacting ${instance} ...`;
      const response = await fetch(
      `https://${
        encodeURIComponent(instance)
      }/api/v1/accounts/lookup?acct=${
        encodeURIComponent(username)
      }`);
    if (!response.ok) {
      output.value =
        `Could not retrieve user name "${username}" from "${instance}"`;
      return;
    }
    const json = await response.json();
    // TODO check if there's an id
    output.value =
      `Account "${username}" on "${instance}" has id "${json.id}".`;
    } catch (e) {
      output.value = `Lookup failed: ${e.message}`;
    }
  })();
}
