export function sufijoSku(numero) {
 if(!Number.isInteger(numero)||numero<1||numero>26*999)throw Object.assign(new Error('La categoría alcanzó el máximo de productos: Z999.'),{status:409});
 return String.fromCharCode(65+Math.floor((numero-1)/999))+String((numero-1)%999+1).padStart(3,'0');
}
export async function crearProducto(pool,companyId,producto){
 return pool.rpc('product.create',companyId,producto);
}
