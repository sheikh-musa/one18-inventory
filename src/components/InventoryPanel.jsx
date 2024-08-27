import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from "@/components/ui/use-toast";

const LOCATIONS = ["826", "201"];

const InventoryPanel = () => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [updatingProducts, setUpdatingProducts] = useState({});
  const { toast } = useToast();

  const storeUrl = import.meta.env.VITE_STORE_URL;
  const consumerKey = import.meta.env.VITE_CONSUMER_KEY;
  const consumerSecret = import.meta.env.VITE_CONSUMER_SECRET;

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [productsResponse, categoriesResponse] = await Promise.all([
        fetch(
          `${storeUrl}/wp-json/wc/v3/products?status=publish&per_page=100&consumer_key=${consumerKey}&consumer_secret=${consumerSecret}`
        ),
        fetch(`${storeUrl}/wp-json/wc/v3/products/categories?consumer_key=${consumerKey}&consumer_secret=${consumerSecret}`),
      ]);

      if (!productsResponse.ok || !categoriesResponse.ok) {
        throw new Error(`HTTP error! status: ${productsResponse.status} ${categoriesResponse.status}`);
      }

      const productsData = await productsResponse.json();
      const categoriesData = await categoriesResponse.json();

      // Initialize location availability based on overall stock status
      const productsWithLocations = productsData.map((product) => ({
        ...product,
        locationAvailability: LOCATIONS.reduce((acc, location) => {
          acc[location] = product.stock_status === "instock";
          return acc;
        }, {}),
      }));

      setProducts(productsWithLocations);
      setCategories(categoriesData);
    } catch (error) {
      console.error("Error fetching data:", error);
      setError(`Error fetching data: ${error.message}`);
      toast({
        title: "Error",
        description: `Failed to fetch data: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const updateProductAvailability = async (productId, location, isAvailable) => {
    setUpdatingProducts((prev) => ({ ...prev, [`${productId}-${location}`]: true }));
    try {
      // Update local state first
      const updatedProducts = products.map((product) =>
        product.id === productId
          ? {
              ...product,
              locationAvailability: {
                ...product.locationAvailability,
                [location]: isAvailable,
              },
            }
          : product
      );

      const updatedProduct = updatedProducts.find((p) => p.id === productId);
      const isInStockAnywhere = Object.values(updatedProduct.locationAvailability).some((v) => v);

      // Only update WooCommerce if the overall stock status is changing
      if (isInStockAnywhere !== (updatedProduct.stock_status === "instock")) {
        const response = await fetch(
          `${storeUrl}/wp-json/wc/v3/products/${productId}?consumer_key=${consumerKey}&consumer_secret=${consumerSecret}`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              stock_status: isInStockAnywhere ? "instock" : "outofstock",
            }),
          }
        );
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
        }
        // Update the stock_status in our local state
        updatedProduct.stock_status = isInStockAnywhere ? "instock" : "outofstock";
      }

      setProducts(updatedProducts);
      toast({
        title: "Success",
        description: `Updated ${location} to ${isAvailable ? "in stock" : "out of stock"}: ${updatedProduct.name}`,
      });
    } catch (error) {
      console.error("Error updating product availability:", error);
      setError(`Error updating product: ${error.message}`);
      toast({
        title: "Error",
        description: `Failed to update product: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setUpdatingProducts((prev) => ({ ...prev, [`${productId}-${location}`]: false }));
    }
  };

  const groupProductsByCategory = () => {
    const grouped = {};
    categories.forEach((category) => {
      grouped[category.id] = {
        name: category.name,
        products: products.filter((product) => product.categories.some((cat) => cat.id === category.id)),
      };
    });
    return grouped;
  };

  const groupedProducts = groupProductsByCategory();

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle>Bakery Inventory Management</CardTitle>
      </CardHeader>
      <CardContent>
        <Button onClick={fetchData} disabled={loading}>
          {loading ? "Loading..." : "Refresh Products"}
        </Button>
        {error && <p className="text-red-500 mt-4">{error}</p>}
        {Object.entries(groupedProducts).length > 0 && (
          <Accordion type="single" collapsible className="mt-4">
            {Object.entries(groupedProducts).map(([categoryId, category]) => (
              <AccordionItem value={categoryId} key={categoryId}>
                <AccordionTrigger>{category.name}</AccordionTrigger>
                <AccordionContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product Name</TableHead>
                        <TableHead>Online Status</TableHead>
                        {LOCATIONS.map((location) => (
                          <TableHead key={location}>{location}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {category.products.map((product) => (
                        <TableRow key={product.id}>
                          <TableCell>{product.name}</TableCell>
                          <TableCell>{product.stock_status === "instock" ? "In Stock" : "Out of Stock"}</TableCell>
                          {LOCATIONS.map((location) => (
                            <TableCell key={`${product.id}-${location}`}>
                              <Switch
                                checked={product.locationAvailability?.[location] ?? false}
                                onCheckedChange={(checked) => updateProductAvailability(product.id, location, checked)}
                                disabled={updatingProducts[`${product.id}-${location}`]}
                              />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
};

export default InventoryPanel;
