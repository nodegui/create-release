require("child_process").execSync("npm install @actions/core @actions/github", {
  cwd: __dirname
});
const fs = require("fs");
const core = require("@actions/core");
const github = require("@actions/github");

const main = async () => {
  const api = new github.GitHub(core.getInput("token"));
  const name = core.getInput("name");
  const code = core.getInput("code");
  const body = core.getInput("body");
  const prerelease = core.getInput("prerelease") == "true";
  const recreate = core.getInput("recreate") == "true";
  const assets = core
    .getInput("assets")
    .split(" ")
    .map(asset => asset.split(":"));

  if (recreate) {
    await deleteReleaseIfExists(code);
  }

  const release = await api.repos.createRelease({
    ...github.context.repo,
    tag_name: code,
    target_commitish: github.context.sha,
    name,
    body,
    prerelease: prerelease
  });

  for (const [source, target, type] of assets) {
    const data = fs.readFileSync(source);
    api.repos.uploadReleaseAsset({
      url: release.data.upload_url,
      headers: {
        ["content-type"]: type,
        ["content-length"]: data.length
      },
      name: target,
      file: data
    });
  }
};

async function deleteReleaseIfExists(code) {
  let release;
  try {
    release = await api.repos.getReleaseByTag({
      ...github.context.repo,
      tag: code
    });
  } catch (err) {
    console.log(err);
    console.log("Release not found.. moving to creation");
  }
  if (!release) {
    return;
  }
  const deleteRelease = async () =>
    api.repos.deleteRelease({
      ...github.context.repo,
      release_id: release.data.id
    });

  const deleteTagRef = async () =>
    api.git.deleteRef({
      ...github.context.repo,
      ref: `tags/${code}`
    });

  await retryOnFail(deleteRelease, 3);
  await retryOnFail(deleteTagRef, 3);
}

async function retryOnFail(asyncFunction, maxTries = 3) {
  if (maxTries < 1) {
    throw `Retried ${maxTries}.. failed always. aborting`;
  }
  try {
    await delay(1000);
    return await asyncFunction();
  } catch (err) {
    console.log(err);
    console.log(`Retrying now...`);
    retryOnFail(asyncFunction, maxTries - 1);
  }
}

async function delay(ms) {
  await new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

main().catch(error => {
  console.error(error);
  core.setFailed(error.message);
});
