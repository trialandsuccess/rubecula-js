import { log } from "./_log";

// JS functions

// constants
const TIMEOUT_TIMES = 10; // how often reconnect to server, fixme: re-use
const TIMEOUT_WAIT = 1000; // how long wait before reconnect to server

// based on https://github.com/arlac77/svelte-websocket-store/blob/master/src/index.mjs ; modified

function now() {
    return new Date();
}

let socket, open_promise, iteration;

async function start_conn() {
    // we are still in the opening phase
    if (open_promise) {
        return open_promise;
    }

    log("connecting...");
    iteration++;

    let wsuri;
    if (window.location.protocol === "file:") {
        wsuri = "ws://127.0.0.1:8080/ws?a=23&foo=bar";
    } else {
        let port = window.location.port ? `:${window.location.port}` : ""; // default not needed with nginx configured for ws
        let protocol = window.location.protocol === "http:" ? "ws" : "wss";
        wsuri = `${protocol}://${window.location.hostname}${port}/ws?a=23&foo=bar`;
    }

    if ("WebSocket" in window) {
        socket = new WebSocket(wsuri);
    } else if ("MozWebSocket" in window) {
        // noinspection JSUnresolvedFunction
        socket = new MozWebSocket(wsuri);
    } else {
        alert("Browser does not support WebSocket!");
        return;
    }

    socket.onopen = (_) => {
        log("Connected to " + wsuri);
        log(`(for the ${iteration}th time)`);

        python._update_method_list();
    };

    socket.onmessage = (e) => {
        handle(e.data);
    };

    socket.onclose = on_close;

    open_promise = new Promise((resolve, reject) => {
        socket.onerror = (error) => {
            reject(error);
            open_promise = undefined;
        };
        socket.onopen = (_) => {
            resolve();
            open_promise = undefined;
        };
    });
    return open_promise;
}

start_conn();

function on_close(e) {
    log("Connection closed (wasClean = " + e.wasClean + ", code = " + e.code + ", reason = '" + e.reason + "')");

    if (socket) {
        socket.close();
        socket = undefined;
    }

    setTimeout(start_conn, TIMEOUT_WAIT);
}

function send(data) {
    let guid = undefined;
    if (typeof data == "object") {
        guid = crypto.randomUUID();
        data["return"] = guid;
    }

    const _send = () => socket.send(JSON.stringify(data));
    if (socket.readyState !== WebSocket.OPEN) start_conn().then(_send);
    else _send();

    return guid ? promise_ws(guid) : null;
}

// functions
let functions = {};
let promises = {};

export function expose(f) {
    functions[f.name] = f;
}

export const expose_function = expose;

function promise_ws(return_id) {
    let _p = {
        created_at: now(),
    };

    const p = new Promise(function (resolve, reject) {
        _p["resolve"] = resolve;
        _p["reject"] = reject;
    });

    _p["promise"] = p;

    promises[return_id] = _p;
    return p;
}

// 1 minute:
const EXPIRE_PROMISES = 1000 * 60;

async function cleanup_old_promises() {
    const n = now();
    for (let id of Object.keys(promises)) {
        const prom = promises[id];

        if (n - prom.created_at > EXPIRE_PROMISES) {
            delete promises[id];
        }
    }
}

function handle(data) {
    let response;

    try {
        response = JSON.parse(data);

        if (response["return"]) {
            promises[response["return"]].resolve(response.data ?? response);

            delete promises[response["return"]]; // cleanup
        }
    } catch (e) {
        throw data;
    } finally {
        cleanup_old_promises();
    }

    // if no error:

    if (response && response["function"] && functions[response["function"]]) {
        return functions[response["function"]](response.data);
    }
}

const _handler_func = {
    apply(_, __, args) {
        let result = send({ function: this._python_func, data: args });
        this._python_func = null;
        return result;
    },
    get(f, python_func) {
        // f is just there to placehold the function class
        if (python_func.startsWith("_")) {
            // internal function, use regular get
            return this[python_func];
        } else {
            this._python_func = python_func;
            return new Proxy(f, _handler_func);
        }
    },
};

class Python {
    _proxy;

    constructor(value, handler) {
        this._proxy = this.__proto__.__proto__ = new Proxy(value, handler);
    }
}

export const python = new Python((_) => 0, _handler_func);

function update() {
    window.location.reload();
}

expose_function(update);
