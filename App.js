import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, deleteDoc, doc, query, orderBy } from 'firebase/firestore';

// Define the main App component, which will contain all the logic and UI.
const App = () => {
  // Use React state to manage the list of products on the left side of the screen.
  const [products, setProducts] = useState([]);
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [loading, setLoading] = useState(true);

  // Define the list of available bakery items and their IDs.
  const bakeryItems = [
    { id: 'sausageRoll', name: 'Sausage Roll' },
    { id: 'hamCheeseCroissant', name: 'Ham and Cheese Croissant' },
    { id: 'spinachRoll', name: 'Spinach Roll' },
  ];

  // This useEffect hook handles the Firebase initialization and authentication.
  useEffect(() => {
    // Check if the required Firebase global variables are available.
    if (typeof __firebase_config !== 'undefined' && typeof __app_id !== 'undefined') {
      try {
        // Parse the Firebase configuration from the global variable.
        const firebaseConfig = JSON.parse(__firebase_config);
        // Initialise the Firebase app with the configuration.
        const app = initializeApp(firebaseConfig);
        // Get the Firestore database and Auth service instances.
        const firestoreDb = getFirestore(app);
        const firebaseAuth = getAuth(app);
        
        // Store the database and auth instances in the component's state.
        setDb(firestoreDb);
        setAuth(firebaseAuth);

        // Listen for changes in the user's authentication state.
        const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
          if (user) {
            // User is signed in. Set the userId and mark auth as ready.
            setUserId(user.uid);
            setIsAuthReady(true);
            setLoading(false);
          } else {
            // User is signed out, try to sign in anonymously.
            if (typeof __initial_auth_token !== 'undefined') {
              // Sign in with the provided custom token.
              await signInWithCustomToken(firebaseAuth, __initial_auth_token);
            } else {
              // Sign in anonymously if no token is available.
              await signInAnonymously(firebaseAuth);
            }
          }
        });

        // Clean up the auth state listener when the component unmounts.
        return () => unsubscribe();
      } catch (error) {
        console.error("Failed to initialize Firebase:", error);
      }
    } else {
      console.error("Firebase config or app ID not found.");
      setLoading(false);
    }
  }, []); // The empty dependency array ensures this runs only once on mount.

  // This useEffect hook handles fetching data from Firestore in real time.
  useEffect(() => {
    // Only proceed if Firebase is initialised and authentication is ready.
    if (isAuthReady && db) {
      setLoading(true);
      // Construct the Firestore collection path for public data.
      const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
      const collectionPath = `/artifacts/${appId}/public/data/bakeryOrders`;
      const q = collection(db, collectionPath);
      
      // Set up a real-time listener using onSnapshot.
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const productList = [];
        // Iterate over the documents in the snapshot and add them to the productList.
        snapshot.forEach((doc) => {
          productList.push({ id: doc.id, ...doc.data() });
        });
        // Sort the products by creation date to maintain order, as orderBy is avoided due to indexing issues.
        productList.sort((a, b) => a.timestamp - b.timestamp);
        // Update the state with the new list of products.
        setProducts(productList);
        setLoading(false);
      }, (error) => {
        console.error("Error getting real-time updates:", error);
        setLoading(false);
      });
      
      // Clean up the listener when the component unmounts.
      return () => unsubscribe();
    }
  }, [isAuthReady, db]); // This hook runs whenever auth state or database instance changes.

  // Function to add a product to the Firestore database.
  const handleAddProduct = async (product) => {
    // Only add a product if Firebase is ready.
    if (!db || !isAuthReady) {
      console.error("Database not ready or not authenticated.");
      return;
    }
    setLoading(true);
    try {
      const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
      const collectionPath = `/artifacts/${appId}/public/data/bakeryOrders`;
      // Use addDoc to automatically generate a new document ID.
      await addDoc(collection(db, collectionPath), {
        name: product.name,
        timestamp: Date.now(),
        // Store the userId to know which user added the item.
        addedBy: userId,
      });
      setLoading(false);
    } catch (e) {
      console.error("Error adding document: ", e);
      setLoading(false);
    }
  };

  // Function to remove a product from the Firestore database.
  const handleRemoveProduct = async (id) => {
    // Only remove a product if Firebase is ready.
    if (!db || !isAuthReady) {
      console.error("Database not ready or not authenticated.");
      return;
    }
    setLoading(true);
    try {
      const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
      const collectionPath = `/artifacts/${appId}/public/data/bakeryOrders`;
      // Use deleteDoc and doc to delete the specific document by its ID.
      await deleteDoc(doc(db, collectionPath, id));
      setLoading(false);
    } catch (e) {
      console.error("Error removing document: ", e);
      setLoading(false);
    }
  };

  // Main render function for the component.
  return (
    <div className="flex flex-col md:flex-row h-screen font-sans bg-gray-50 text-gray-800">
      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-500 bg-opacity-75 z-50">
          <div className="text-white text-lg animate-pulse">Loading...</div>
        </div>
      )}
      {/* Left side: Live list of products */}
      <div className="w-full md:w-1/2 p-6 md:p-12 flex flex-col justify-between overflow-y-auto">
        <div>
          <h1 className="text-3xl md:text-5xl font-extrabold text-gray-900 mb-6">Live Bakery Orders</h1>
          <p className="text-gray-600 mb-8 md:mb-12">
            Click a button on the right to add an item to the list. Use the **X** to remove it. Your User ID: {userId}
          </p>

          <div className="grid grid-cols-1 gap-4">
            {products.length === 0 ? (
              <p className="text-gray-500 text-center text-xl mt-10">No items in the list. Add some!</p>
            ) : (
              products.map((product) => (
                <div key={product.id} className="relative flex items-center justify-between bg-white rounded-lg shadow-md p-4 md:p-6 transition-transform duration-200 transform hover:scale-105">
                  <span className="text-lg md:text-xl font-semibold text-gray-700">{product.name}</span>
                  <button
                    onClick={() => handleRemoveProduct(product.id)}
                    className="absolute top-2 right-2 text-gray-400 hover:text-red-500 transition-colors duration-200 p-1"
                    aria-label={`Remove ${product.name}`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 md:h-6 md:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Right side: Product buttons */}
      <div className="w-full md:w-1/2 p-6 md:p-12 flex flex-col justify-center items-center bg-white rounded-t-xl md:rounded-l-none md:rounded-r-xl shadow-lg border-t-4 md:border-t-0 md:border-l-4 border-gray-100">
        <h2 className="text-2xl md:text-4xl font-extrabold text-gray-900 mb-6 text-center">Our Delicious Products</h2>
        <div className="flex flex-col space-y-4 w-full max-w-sm">
          {bakeryItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleAddProduct(item)}
              className="w-full py-4 text-xl font-bold rounded-full shadow-lg transition-all duration-300 transform hover:scale-105 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-yellow-500 focus:ring-opacity-50
              bg-gradient-to-r from-yellow-400 to-amber-500 text-white"
            >
              {item.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default App;
