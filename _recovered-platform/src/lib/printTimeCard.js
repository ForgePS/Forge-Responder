const PRINT_ROOT_CLASS = "time-card-print-root";

export function printTimeCard(mode = "single") {
  const selector = mode === "bulk"
    ? ".time-card-bulk-print-stack"
    : ".time-card-single-print-target";
  const source = document.querySelector(selector);
  if (!source) {
    window.print();
    return;
  }

  const printRoot = source.cloneNode(true);
  printRoot.classList.add(PRINT_ROOT_CLASS);
  document.body.appendChild(printRoot);
  document.body.dataset.printMode = mode;
  document.body.classList.add("is-printing-time-card");

  const cleanup = () => {
    printRoot.remove();
    document.body.classList.remove("is-printing-time-card");
    delete document.body.dataset.printMode;
    window.removeEventListener("afterprint", cleanup);
  };

  window.addEventListener("afterprint", cleanup);
  requestAnimationFrame(() => {
    window.print();
  });
}
