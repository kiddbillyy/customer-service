const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
/* const rolesRoutes   = require('./routes/Role.Router');
const departmentsRoutes = require('./routes/Departments.Routes');
const modulosPlataformaRoutes = require('./routes/ModulosPlataforma.Routes');
const submodulosRoutes = require('./routes/SubModulos.Routes');
const endpointsApiRoutes = require('./routes/Endpoints.Routes') */
const apiRoutes = require('./routes/index')


dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/idservice', apiRoutes);

const PORT = process.env.PORT || 5007;

app.listen(PORT, () => {
  console.log(`🚀 ID Service running on port ${PORT}`);
});
