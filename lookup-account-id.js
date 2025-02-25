const input = document.querySelector("#account_input");
const output = document.querySelector('#account_id');
input.addEventListener("change", lookupAccountId);

async function lookupAccountId() {
  try {
    const {value} = input;
    const parts = value.trim().split('@');
    if (parts[0] === '') {
      parts.shift();
    }
    if (parts.length !== 2) {
      output.value = `Unexpected account syntax: "${value}"`;
      return;
    }
    const [username, instance] = parts;
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
    if (json.id == undefined) {
      output.value =
        `No id provided for "${username}" on "${instance}"`;
      return;
    }
    output.value =
      `Account "${username}" on "${instance}" has id "${json.id}".`;
  } catch (e) {
    output.value = `Lookup failed: ${e.message}`;
  }
}
