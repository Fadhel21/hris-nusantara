const { buatApp } = require('./app');
const { muat } = require('./config/env');

const { port } = muat();
buatApp().listen(port, () => console.log(`HRIS berjalan di http://localhost:${port}`));
