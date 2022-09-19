const params = new URLSearchParams(document.location.search);
const sheet = document.head.appendChild(document.createElement('style'));
sheet.textContent = params.get('css');
