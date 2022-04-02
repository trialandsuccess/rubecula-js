class Logging {
    enabled = 0;
    target = undefined;

    constructor() {
        this.log = this.log.bind(this);
    }

    enable(target = undefined) {
        this.enabled = 1;
        this.target = target;

        target.style.display = null; // = show
    }

    disable() {
        this.enabled = 0;

        this.target.style.display = "none"; // hide
        this.target = undefined;
    }

    log(...args) {
        // javascript classes are cursed so 'this' can be undefined
        if (!this.enabled) {
            return;
        }

        const ellog = this.target;

        if (ellog) {
            for (let m of args) {
                ellog.innerHTML += m + "\n";
            }
            ellog.scrollTop = ellog.scrollHeight;
        }
        console.info(...args);
    }
}

export const logger = new Logging();

export const log = logger.log;
