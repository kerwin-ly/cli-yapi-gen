const fs = require("fs");
const path = require("path");
const { get } = require("lodash");
const inquirer = require("inquirer");
const prompt = inquirer.createPromptModule();

let json = {};
let interfaces = [];
let tag = "";
let interfaceName = ""; // 接口名称
let isReq = true; // 是否是response or request
let method = ""; // 请求方法

async function updateSwagger(jsonUrl) {
  json = require(path.join(process.cwd(), jsonUrl));

  if (json.definitions && JSON.stringify(json.definitions) !== "{}") {
    console.info(`Models has already generated`);
    return;
  }

  const tagNames = json.tags.map((item) => item.name);
  const answers = await prompt([
    {
      type: "checkbox",
      name: "tags",
      message: "Please select needed tags to generate services",
      choices: tagNames,
      default: tagNames,
    },
  ]);
  json.tags = json.tags.filter((item) => answers.tags.includes(item.name));

  interfaces = Object.keys(json.paths);
  generateDefinations();
  loop(json.paths);

  try {
    fs.writeFileSync(
      path.join(process.cwd(), jsonUrl),
      JSON.stringify(json, null, "\t")
    );
    console.info(`Updated ${jsonUrl}`);
  } catch (error) {
    console.error(error);
  }
}

function generateDefinations() {
  const tags = json.tags;

  json.definitions = {};
  for (let i = 0; i < tags.length; i++) {
    const name = tags[i].name;

    !json.definitions[name] && (json.definitions[name] = {});
  }
}

// 递归处理json树中的特定参数
function loop(obj) {
  // tslint:disable-next-line: forin
  for (const key in obj) {
    if (interfaces.includes(key)) {
      interfaceName = key;
    }
    switch (key) {
      case "put":
      case "post":
        method = key;
        break;
      case "delete":
      case "get":
        // 防止yapi生成的delete,get 请求在body中携带了参数
        obj[key].parameters = obj[key].parameters.filter(
          (item) => item.in !== "body"
        );
        method = key;
        break;
      case "parameters":
        isReq = true;

        // 过滤header里面的参数
        const filters = ["header"];
        obj[key] = obj[key].filter((item) => !filters.includes(item.in));

        // 将参数名root，修改为params
        obj[key].forEach((item) => {
          if (item.name === "root") {
            item.name = "params";
          }
        });

        break;
      case "responses":
        isReq = false;
        break;
      case "tags":
        if (typeof obj.tags[0] === "string") {
          tag = obj.tags[0]; // 获取当前分类
        }
        break;
    }

    if (
      Object.prototype.toString.call(obj[key]) === "[object Object]" ||
      Object.prototype.toString.call(obj[key]) === "[object Array]"
    ) {
      if (key === "schema") {
        const tempInterface = toUpper(interfaceName);
        const upperMethod = toCamel(method);
        const model = isReq
          ? `${tempInterface}${upperMethod}Params`
          : `Res${upperMethod}${tempInterface}`;

        if (json.definitions[tag] && json.definitions[tag][model]) {
          console.info(`Duplicate model: ${model}`);
          return;
        }
        const tempTagNames = json.tags.map((item) => item.name);
        if (!tempTagNames.includes(tag)) return;

        if (isReq && JSON.stringify(obj[key].properties) !== "{}") {
          json.definitions[tag][model] = obj[key];
          obj[key] = {
            $ref: `#/definitions/${tag}/${model}`,
          };
        } else if (
          !isReq &&
          JSON.stringify(get(obj[key], "properties.data.properties")) &&
          JSON.stringify(get(obj[key], "properties.data.properties")) !== "{}"
        ) {
          json.definitions[tag][model] = get(obj[key], "properties.data");
          obj[key].properties.data = {
            $ref: `#/definitions/${tag}/${model}`,
          };
        }
      }
      loop(obj[key]);
    }
  }
}

function toUpper(name) {
  filterName = name.replace(/\{.*?\}|:/g, "");
  const list = filterName.split("/");

  return list.reduce(
    (item, key) => (item += key.slice(0, 1).toUpperCase() + key.slice(1)),
    ""
  );
}

function toCamel(name) {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

module.exports = updateSwagger;
